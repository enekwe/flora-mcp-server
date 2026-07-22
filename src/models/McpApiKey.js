const mongoose = require('mongoose');
const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * MCP API Key Model
 * API keys for authenticating IDE/CLI agents connecting via MCP
 * Supports 3-tier BYOK: passbook_budget, company_byok, site_byok
 */
const McpApiKeySchema = new mongoose.Schema({
  // Key identifier
  name: {
    type: String,
    required: [true, 'Key name is required'],
    trim: true,
    maxLength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, 'Description cannot exceed 500 characters']
  },

  // Owner
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudioCompany',
    required: [true, 'Company ID is required'],
    index: true
  },
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site'
  },

  // Key data (hashed, never stored in plain text)
  keyHash: {
    type: String,
    required: [true, 'Key hash is required'],
    unique: true,
    trim: true
  },
  keyPrefix: {
    type: String,
    required: [true, 'Key prefix is required'],
    trim: true
  },

  // BYOK tier
  tier: {
    type: String,
    enum: ['passbook_budget', 'company_byok', 'site_byok'],
    required: [true, 'Tier is required'],
    default: 'passbook_budget'
  },

  // Budget limits (per BYOK tier)
  budgetLimits: {
    monthlyTokenCap: {
      type: Number,
      default: null
    },
    monthlyCostCap: {
      type: Number,
      default: null
    },
    perRequestTokenCap: {
      type: Number,
      default: null
    }
  },

  // Usage tracking
  usage: {
    totalTokensUsed: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    totalRequests: { type: Number, default: 0 },
    monthlyTokensUsed: { type: Number, default: 0 },
    monthlyCost: { type: Number, default: 0 },
    monthlyRequests: { type: Number, default: 0 },
    lastResetAt: { type: Date, default: Date.now }
  },

  // Permissions scope
  permissions: {
    workOrders: {
      read: { type: Boolean, default: true },
      update: { type: Boolean, default: false }
    },
    tasks: {
      read: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      create: { type: Boolean, default: false }
    },
    providerRouting: {
      use: { type: Boolean, default: true }
    },
    contextBoundary: {
      read: { type: Boolean, default: true },
      enforce: { type: Boolean, default: true }
    },
    promptVault: {
      read: { type: Boolean, default: false },
      store: { type: Boolean, default: true }
    },
    // Triggers real infra provisioning + LLM spend downstream — opt-in only, default disabled.
    appKit: {
      build: { type: Boolean, default: false },
      read: { type: Boolean, default: false }
    }
  },

  // Key status
  status: {
    type: String,
    enum: ['active', 'revoked', 'expired'],
    default: 'active',
    index: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  revokedAt: Date,
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revocationReason: String,

  // Security context
  security: {
    allowedAgentTypes: [{
      type: String,
      enum: ['claude_code', 'cursor', 'vs_code', 'qwen_code', 'copilot', 'other']
    }],
    scopingLevel: {
      type: String,
      enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'],
      default: 'INTERNAL'
    },
    dataResidencyRegion: String,
    ipWhitelist: [String]
  },

  // Audit fields
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'mcp_api_keys'
});

// Compound indexes
McpApiKeySchema.index({ companyId: 1, status: 1 });
McpApiKeySchema.index({ userId: 1, status: 1 });
McpApiKeySchema.index({ tier: 1, status: 1 });
McpApiKeySchema.index({ keyPrefix: 1 });

// Pre-save middleware
McpApiKeySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method: check if key is within budget
McpApiKeySchema.methods.isWithinBudget = function(tokensToAdd = 0, costToAdd = 0) {
  if (this.status !== 'active') return false;

  if (this.tier === 'passbook_budget') {
    if (this.budgetLimits.monthlyCostCap && (this.usage.monthlyCost + costToAdd) > this.budgetLimits.monthlyCostCap) {
      return false;
    }
    if (this.budgetLimits.monthlyTokenCap && (this.usage.monthlyTokensUsed + tokensToAdd) > this.budgetLimits.monthlyTokenCap) {
      return false;
    }
  }

  if (this.expiresAt && new Date() > this.expiresAt) {
    return false;
  }

  return true;
};

// Instance method: record usage
McpApiKeySchema.methods.recordUsage = function(tokensUsed, cost) {
  this.usage.totalTokensUsed += tokensUsed;
  this.usage.totalCost += cost;
  this.usage.totalRequests += 1;
  this.usage.monthlyTokensUsed += tokensUsed;
  this.usage.monthlyCost += cost;
  this.usage.monthlyRequests += 1;

  if (this.tier === 'passbook_budget' && this.budgetLimits.monthlyCostCap) {
    const utilizationPercent = (this.usage.monthlyCost / this.budgetLimits.monthlyCostCap) * 100;
    if (utilizationPercent >= 90) {
      logger.warn(`MCP API key ${this._id} approaching budget cap: ${utilizationPercent.toFixed(1)}%`);
    }
  }

  return this.save();
};

// Instance method: revoke
McpApiKeySchema.methods.revoke = function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  this.revokedAt = new Date();
  return this.save();
};

// Instance method: reset monthly usage
McpApiKeySchema.methods.resetMonthlyUsage = function() {
  this.usage.monthlyTokensUsed = 0;
  this.usage.monthlyCost = 0;
  this.usage.monthlyRequests = 0;
  this.usage.lastResetAt = new Date();
  return this.save();
};

// Instance method: soft delete
McpApiKeySchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Query helper: active keys only
McpApiKeySchema.query.activeOnly = function() {
  return this.where({ isDeleted: false, status: 'active' });
};

// Static method: generate API key
McpApiKeySchema.statics.generateKey = function(prefix = 'flora_mcp_') {
  const rawKey = prefix + crypto.randomBytes(32).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, prefix.length + 8);

  return { rawKey, keyHash, keyPrefix };
};

// Static method: find by key hash
McpApiKeySchema.statics.findByKeyHash = function(keyHash) {
  return this.findOne({ keyHash, isDeleted: false, status: 'active' });
};

// Static method: find keys for a company
McpApiKeySchema.statics.findByCompany = function(companyId) {
  return this.find({ companyId, isDeleted: false }).sort({ createdAt: -1 });
};

// Static method: monthly budget check for all keys
McpApiKeySchema.statics.checkMonthlyBudgets = async function() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const overBudgetKeys = await this.find({
    tier: 'passbook_budget',
    status: 'active',
    isDeleted: false,
    'usage.monthlyCost': { $gt: 0 },
    'budgetLimits.monthlyCostCap': { $exists: true, $ne: null }
  });

  const alerts = [];
  for (const key of overBudgetKeys) {
    const utilization = (key.usage.monthlyCost / key.budgetLimits.monthlyCostCap) * 100;
    if (utilization >= 80) {
      alerts.push({
        keyId: key._id,
        companyId: key.companyId,
        userId: key.userId,
        utilization: utilization.toFixed(1),
        tier: key.tier
      });
    }
  }

  return alerts;
};

McpApiKeySchema.set('toJSON', { virtuals: true });
McpApiKeySchema.set('toObject', { virtuals: true });

const McpApiKey = mongoose.model('McpApiKey', McpApiKeySchema);

module.exports = McpApiKey;
