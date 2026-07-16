const mongoose = require('mongoose');
const logger = require('../config/logger');

/**
 * MCP Connection Model
 * Tracks active MCP connections from IDE/CLI agents to Flora Command Center
 * Supports connection lifecycle: active → idle → revoked
 */
const McpConnectionSchema = new mongoose.Schema({
  // API key used for authentication
  apiKeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'McpApiKey',
    required: [true, 'API key ID is required'],
    index: true
  },

  // User who owns this connection
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Company context for this connection
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudioCompany',
    required: [true, 'Company ID is required'],
    index: true
  },

  // Agent identification
  agentType: {
    type: String,
    enum: ['claude_code', 'cursor', 'vs_code', 'qwen_code', 'copilot', 'other'],
    required: [true, 'Agent type is required']
  },
  agentVersion: {
    type: String,
    trim: true
  },
  clientName: {
    type: String,
    trim: true,
    default: 'unknown'
  },

  // Connection metadata
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  connectionSource: {
    type: String,
    enum: ['ide', 'cli', 'mcp_server'],
    default: 'mcp_server'
  },

  // Current work order assignment
  currentWorkOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommandRequest'
  },
  currentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },

  // Connection status
  status: {
    type: String,
    enum: ['active', 'idle', 'revoked', 'expired'],
    default: 'active',
    index: true
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  connectedAt: {
    type: Date,
    default: Date.now
  },
  disconnectedAt: Date,

  // Network info
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },

  // Usage metrics
  metrics: {
    totalToolCalls: { type: Number, default: 0 },
    totalTokensUsed: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    workOrdersCompleted: { type: Number, default: 0 },
    workOrdersAssigned: { type: Number, default: 0 },
    errorsCount: { type: Number, default: 0 },
    lastToolCallAt: Date
  },

  // Security context
  securityContext: {
    scopingLevel: {
      type: String,
      enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'],
      default: 'INTERNAL'
    },
    dataResidencyRegion: String,
    piiPatternsRedacted: { type: Number, default: 0 },
    contextBoundariesEnforced: { type: Number, default: 0 }
  },

  // Revocation details
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revocationReason: String,
  revokedAt: Date,

  // Audit fields
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
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
  collection: 'mcp_connections'
});

// Compound indexes
McpConnectionSchema.index({ companyId: 1, status: 1 });
McpConnectionSchema.index({ userId: 1, status: 1, lastActivityAt: -1 });
McpConnectionSchema.index({ apiKeyId: 1, status: 1 });
McpConnectionSchema.index({ currentWorkOrderId: 1 });

// Pre-save middleware
McpConnectionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method: record activity
McpConnectionSchema.methods.recordActivity = function(toolCallData = {}) {
  this.lastActivityAt = new Date();
  this.metrics.totalToolCalls += 1;
  this.metrics.lastToolCallAt = new Date();

  if (toolCallData.tokensUsed) {
    this.metrics.totalTokensUsed += toolCallData.tokensUsed;
  }
  if (toolCallData.cost) {
    this.metrics.totalCost += toolCallData.cost;
  }

  return this.save();
};

// Instance method: revoke connection
McpConnectionSchema.methods.revoke = function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  this.revokedAt = new Date();
  this.disconnectedAt = new Date();
  return this.save();
};

// Instance method: mark idle
McpConnectionSchema.methods.markIdle = function() {
  this.status = 'idle';
  this.lastActivityAt = new Date();
  return this.save();
};

// Instance method: reactivate
McpConnectionSchema.methods.reactivate = function() {
  if (this.status === 'idle') {
    this.status = 'active';
    this.lastActivityAt = new Date();
  }
  return this.save();
};

// Instance method: assign work order
McpConnectionSchema.methods.assignWorkOrder = function(workOrderId) {
  this.currentWorkOrderId = workOrderId;
  this.metrics.workOrdersAssigned += 1;
  this.lastActivityAt = new Date();
  return this.save();
};

// Instance method: complete work order
McpConnectionSchema.methods.completeWorkOrder = function() {
  this.currentWorkOrderId = null;
  this.currentTaskId = null;
  this.metrics.workOrdersCompleted += 1;
  this.lastActivityAt = new Date();
  return this.save();
};

// Instance method: soft delete
McpConnectionSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Query helper: active connections only
McpConnectionSchema.query.activeOnly = function() {
  return this.where({ isDeleted: false, status: { $in: ['active', 'idle'] } });
};

// Query helper: by company
McpConnectionSchema.query.byCompany = function(companyId) {
  return this.where({ companyId, isDeleted: false });
};

// Static method: find active connections for a company
McpConnectionSchema.statics.findActiveByCompany = function(companyId) {
  return this.find({
    companyId,
    status: { $in: ['active', 'idle'] },
    isDeleted: false
  }).populate('userId', 'name email role').sort({ lastActivityAt: -1 });
};

// Static method: find connection by session ID
McpConnectionSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ sessionId, isDeleted: false, status: { $ne: 'revoked' } });
};

// Static method: get connection stats for a company
McpConnectionSchema.statics.getCompanyStats = async function(companyId) {
  const stats = await this.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(companyId), isDeleted: false } },
    {
      $group: {
        _id: null,
        totalConnections: { $sum: 1 },
        activeConnections: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        idleConnections: {
          $sum: { $cond: [{ $eq: ['$status', 'idle'] }, 1, 0] }
        },
        totalToolCalls: { $sum: '$metrics.totalToolCalls' },
        totalTokensUsed: { $sum: '$metrics.totalTokensUsed' },
        totalCost: { $sum: '$metrics.totalCost' },
        workOrdersCompleted: { $sum: '$metrics.workOrdersCompleted' }
      }
    }
  ]);

  return stats[0] || {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    totalToolCalls: 0,
    totalTokensUsed: 0,
    totalCost: 0,
    workOrdersCompleted: 0
  };
};

// Virtuals
McpConnectionSchema.virtual('isRevoked').get(function() {
  return this.status === 'revoked';
});

McpConnectionSchema.virtual('durationMinutes').get(function() {
  if (!this.connectedAt) return 0;
  const end = this.disconnectedAt || new Date();
  return Math.round((end - this.connectedAt) / (1000 * 60));
});

McpConnectionSchema.set('toJSON', { virtuals: true });
McpConnectionSchema.set('toObject', { virtuals: true });

const McpConnection = mongoose.model('McpConnection', McpConnectionSchema);

module.exports = McpConnection;
