const mongoose = require('mongoose');

/**
 * Comprehensive Audit Log Model for Enterprise Security and Compliance
 * Implements SOX, GDPR, and regulatory compliance requirements
 * Provides tamper-proof audit trails for all system activities
 */
const AuditLogSchema = new mongoose.Schema({
  // Unique audit event identifier
  auditId: {
    type: String,
    required: true,
    unique: true,
    default: () => `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },

  // Event classification
  eventType: {
    type: String,
    required: true,
    enum: [
      // Authentication & Authorization
      'auth:login', 'auth:logout', 'auth:failed_login', 'auth:session_expired',
      'auth:password_change', 'auth:password_reset', 'auth:mfa_enabled', 'auth:mfa_disabled',
      'auth:token_issued', 'auth:token_revoked', 'auth:permission_granted', 'auth:permission_revoked',
      
      // Document Management
      'document:create', 'document:view', 'document:download', 'document:update', 'document:delete',
      'document:upload', 'document:approve', 'document:reject', 'document:share', 'document:classify',
      'document:encrypt', 'document:decrypt', 'document:archive', 'document:restore',
      
      // Financial Operations
      'investment:create', 'investment:update', 'investment:delete', 'investment:approve',
      'capital_call:create', 'capital_call:send', 'capital_call:approve', 'capital_call:payment',
      'capital_call:reminder', 'capital_call:cancel', 'distribution:create', 'distribution:approve',
      
      // Fund Administration
      'fund:create', 'fund:update', 'fund:delete', 'fund:archive', 'fund:restore',
      'fund:performance_update', 'fund:report_generate', 'fund:valuation_update',
      
      // User Management
      'user:create', 'user:update', 'user:delete', 'user:activate', 'user:deactivate',
      'user:role_change', 'user:permission_change', 'user:profile_update',
      
      // System Operations
      'system:backup', 'system:restore', 'system:maintenance', 'system:configuration_change',
      'system:integration_sync', 'system:batch_process', 'system:data_export', 'system:data_import',
      
      // Security Events
      'security:threat_detected', 'security:anomaly_detected', 'security:access_violation',
      'security:data_breach_attempt', 'security:suspicious_activity', 'security:account_lockout',
      'security:ip_blocked', 'security:rate_limit_exceeded',
      
      // Compliance Events
      'compliance:data_retention', 'compliance:data_deletion', 'compliance:gdpr_request',
      'compliance:sox_validation', 'compliance:regulatory_report', 'compliance:audit_export'
    ]
  },

  // Event category for grouping
  category: {
    type: String,
    required: true,
    enum: ['authentication', 'authorization', 'document', 'financial', 'fund', 'user', 'system', 'security', 'compliance']
  },

  // Severity level
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },

  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: String,
  userEmail: String,
  userRole: String,
  sessionId: String,

  // Target/affected entities
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  },
  fundId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fund'
  },
  investmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investment'
  },
  capitalCallId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CapitalCall'
  },
  resourceId: String,
  resourceType: String,

  // Request details
  action: {
    type: String,
    required: true,
    maxlength: 255
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  
  // Network and client information
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: String,
  requestMethod: String,
  requestUrl: String,
  requestHeaders: {
    type: Map,
    of: String
  },
  responseStatus: Number,

  // Geographic and location data
  location: {
    country: String,
    region: String,
    city: String,
    timezone: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  // Security context
  securityContext: {
    authMethod: {
      type: String,
      enum: ['password', 'token', 'mfa', 'sso', 'api_key']
    },
    mfaUsed: Boolean,
    accessLevel: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted', 'highly_confidential']
    },
    permissions: [String],
    securityFlags: [String],
    riskScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },

  // Data classification and protection
  dataClassification: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'restricted', 'highly_confidential'],
    default: 'internal'
  },
  dataTypes: [String], // PII, Financial, Health, etc.
  encryptionUsed: Boolean,

  // Operation results
  success: {
    type: Boolean,
    required: true,
    default: true
  },
  errorCode: String,
  errorMessage: String,
  warnings: [String],

  // Performance metrics
  performanceMetrics: {
    responseTime: Number, // milliseconds
    dataTransferred: Number, // bytes
    queryTime: Number, // milliseconds
    resourcesUsed: {
      cpu: Number,
      memory: Number,
      disk: Number
    }
  },

  // Business context
  businessContext: {
    department: String,
    project: String,
    workflowId: String,
    transactionId: String,
    batchId: String
  },

  // Compliance and regulatory
  complianceFlags: [{
    regulation: {
      type: String,
      enum: ['GDPR', 'SOX', 'PCI_DSS', 'HIPAA', 'SEC', 'FINRA', 'MiFID', 'BASEL']
    },
    requirement: String,
    status: {
      type: String,
      enum: ['compliant', 'non_compliant', 'pending_review']
    }
  }],
  retentionPeriod: {
    type: Number,
    default: 2555 // 7 years in days
  },
  legalHold: {
    type: Boolean,
    default: false
  },

  // Change tracking
  changes: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changeType: {
      type: String,
      enum: ['create', 'update', 'delete', 'archive', 'restore']
    }
  }],

  // File and document specific
  fileInfo: {
    fileName: String,
    filePath: String,
    fileSize: Number,
    mimeType: String,
    checksum: String,
    encryptionMethod: String,
    compressionUsed: Boolean
  },

  // System and environment
  systemInfo: {
    serverInstance: String,
    applicationVersion: String,
    environment: {
      type: String,
      enum: ['development', 'testing', 'staging', 'production']
    },
    timezone: String
  },

  // Related events and correlation
  correlationId: String,
  parentEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditLog'
  },
  relatedEvents: [{
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog'
    },
    relationship: {
      type: String,
      enum: ['parent', 'child', 'sibling', 'trigger', 'consequence']
    }
  }],

  // Tamper protection
  integrity: {
    hash: String,
    signature: String,
    verified: {
      type: Boolean,
      default: false
    }
  },

  // Workflow and approval tracking
  workflow: {
    stepId: String,
    stepName: String,
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled']
    },
    approvalDate: Date,
    comments: String
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    immutable: true,
    index: true
  },
  eventEndTime: Date,
  processingTime: Number,

  // Metadata for extensibility
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Alert and notification tracking
  alertsTriggered: [{
    alertId: String,
    alertType: String,
    severity: String,
    notificationsSent: Number,
    timestamp: Date
  }]
}, {
  timestamps: { createdAt: 'timestamp', updatedAt: false }, // Only track creation time
  versionKey: false,
  strict: true
});

// Compound indexes for performance optimization
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ eventType: 1, timestamp: -1 });
AuditLogSchema.index({ category: 1, severity: 1, timestamp: -1 });
AuditLogSchema.index({ success: 1, timestamp: -1 });
AuditLogSchema.index({ ipAddress: 1, timestamp: -1 });
AuditLogSchema.index({ sessionId: 1, timestamp: -1 });
AuditLogSchema.index({ documentId: 1, timestamp: -1 });
AuditLogSchema.index({ fundId: 1, timestamp: -1 });
AuditLogSchema.index({ correlationId: 1 });
AuditLogSchema.index({ 'securityContext.securityFlags': 1 });
AuditLogSchema.index({ 'complianceFlags.regulation': 1 });
AuditLogSchema.index({ dataClassification: 1, timestamp: -1 });

// Sparse indexes for optional fields
AuditLogSchema.index({ targetUserId: 1, timestamp: -1 }, { sparse: true });
AuditLogSchema.index({ investmentId: 1, timestamp: -1 }, { sparse: true });
AuditLogSchema.index({ capitalCallId: 1, timestamp: -1 }, { sparse: true });

// Text index for searching descriptions and metadata
AuditLogSchema.index({
  description: 'text',
  action: 'text',
  'metadata.$**': 'text'
});

// TTL index for automatic log retention
AuditLogSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: function() {
      return this.retentionPeriod * 24 * 60 * 60; // Convert days to seconds
    },
    partialFilterExpression: { legalHold: { $ne: true } }
  }
);

// Pre-save middleware for data integrity
AuditLogSchema.pre('save', function(next) {
  // Ensure immutability - prevent updates after creation
  if (!this.isNew) {
    const error = new Error('Audit logs are immutable and cannot be modified');
    error.name = 'AuditLogImmutableError';
    return next(error);
  }

  // Generate correlation ID if not provided
  if (!this.correlationId) {
    this.correlationId = `CORR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Set default system info
  if (!this.systemInfo.serverInstance) {
    this.systemInfo.serverInstance = process.env.SERVER_INSTANCE_ID || require('os').hostname();
  }
  if (!this.systemInfo.applicationVersion) {
    this.systemInfo.applicationVersion = process.env.APP_VERSION || '1.0.0';
  }
  if (!this.systemInfo.environment) {
    this.systemInfo.environment = process.env.NODE_ENV || 'development';
  }

  // Generate integrity hash
  this.generateIntegrityHash();

  next();
});

// Method to generate integrity hash for tamper detection
AuditLogSchema.methods.generateIntegrityHash = function() {
  const crypto = require('crypto');
  
  const dataToHash = {
    auditId: this.auditId,
    eventType: this.eventType,
    userId: this.userId,
    action: this.action,
    timestamp: this.timestamp,
    ipAddress: this.ipAddress,
    success: this.success
  };

  this.integrity.hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(dataToHash))
    .digest('hex');
};

// Method to verify integrity
AuditLogSchema.methods.verifyIntegrity = function() {
  const crypto = require('crypto');
  
  const dataToHash = {
    auditId: this.auditId,
    eventType: this.eventType,
    userId: this.userId,
    action: this.action,
    timestamp: this.timestamp,
    ipAddress: this.ipAddress,
    success: this.success
  };

  const calculatedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(dataToHash))
    .digest('hex');

  return calculatedHash === this.integrity.hash;
};

// Static method to create audit log with enhanced security
AuditLogSchema.statics.createSecureLog = async function(logData) {
  // Validate required fields
  const requiredFields = ['eventType', 'category', 'userId', 'action', 'description', 'ipAddress'];
  for (const field of requiredFields) {
    if (!logData[field]) {
      throw new Error(`Required field '${field}' is missing`);
    }
  }

  // Create audit log
  const auditLog = new this(logData);
  await auditLog.save();
  
  return auditLog;
};

// Static method for compliance reporting
AuditLogSchema.statics.generateComplianceReport = async function(regulation, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        'complianceFlags.regulation': regulation
      }
    },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        compliantEvents: {
          $sum: { $cond: [{ $eq: ['$complianceFlags.status', 'compliant'] }, 1, 0] }
        },
        nonCompliantEvents: {
          $sum: { $cond: [{ $eq: ['$complianceFlags.status', 'non_compliant'] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        complianceRate: {
          $multiply: [
            { $divide: ['$compliantEvents', '$count'] },
            100
          ]
        }
      }
    },
    { $sort: { count: -1 } }
  ];

  return await this.aggregate(pipeline);
};

// Static method for security analysis
AuditLogSchema.statics.analyzeSecurityEvents = async function(timeframe = 24) {
  const hoursAgo = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  
  const pipeline = [
    {
      $match: {
        timestamp: { $gte: hoursAgo },
        category: 'security'
      }
    },
    {
      $group: {
        _id: {
          severity: '$severity',
          eventType: '$eventType'
        },
        count: { $sum: 1 },
        users: { $addToSet: '$userId' },
        ips: { $addToSet: '$ipAddress' }
      }
    },
    {
      $addFields: {
        uniqueUsers: { $size: '$users' },
        uniqueIPs: { $size: '$ips' }
      }
    },
    { $sort: { count: -1 } }
  ];

  return await this.aggregate(pipeline);
};

// Prevent deletion of audit logs
AuditLogSchema.pre('deleteOne', function(next) {
  const error = new Error('Audit logs cannot be deleted for compliance reasons');
  error.name = 'AuditLogDeletionError';
  next(error);
});

AuditLogSchema.pre('deleteMany', function(next) {
  const error = new Error('Audit logs cannot be deleted for compliance reasons');
  error.name = 'AuditLogDeletionError';
  next(error);
});

// Prevent updates to audit logs
AuditLogSchema.pre('updateOne', function(next) {
  const error = new Error('Audit logs are immutable and cannot be updated');
  error.name = 'AuditLogImmutableError';
  next(error);
});

AuditLogSchema.pre('updateMany', function(next) {
  const error = new Error('Audit logs are immutable and cannot be updated');
  error.name = 'AuditLogImmutableError';
  next(error);
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);