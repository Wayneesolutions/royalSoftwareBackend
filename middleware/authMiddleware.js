import jwt from 'jsonwebtoken'
import User from '../models/user/userModel.js'
import Ledger from '../models/ledger/ledgerModel.js'
import Company from '../models/company/companyModel.js'

// Auth middleware with optional role-based authorization
export const authMiddleware = (requiredRoles = []) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Missing token' })
      }

      const secret = process.env.JWT_SECRET
      if (!secret) {
        return res.status(500).json({ success: false, message: 'Server misconfiguration: JWT secret missing' })
      }

      const decoded = jwt.verify(token, secret)

      // Normalize common id/role fields from various issuers
      const userId = decoded.userId || decoded.id || decoded._id
      const role = decoded.role
      const isLedger = decoded.isLedger || false

      let user = null;
      let effectiveRole = role;

      // Check if this is a ledger-based login (dealer from Ledger model)
      if (isLedger) {
        // Fetch ledger details from database
        const ledger = await Ledger.findById(userId)
          .populate('companyId', 'companyName companyCode companyEmail companyMobile contactDetails')
          .populate('createdBy', 'name email');

        if (!ledger || !ledger.isActive) {
          return res.status(401).json({ success: false, message: 'Dealer not found or inactive' })
        }

        // Get company
        const company = await Company.findById(ledger.companyId)
          .select('companyName companyCode companyEmail companyMobile contactDetails');

        // Format ledger as user-like object for consistency
        user = {
          _id: ledger._id,
          email: ledger.Email || '',
          name: ledger.LedgerName,
          mobile: ledger.LedgerMobile || '',
          role: 'dealers',
          defaultCompany: company,
          companies: company ? [{
            companyId: company,
            role: 'dealers',
            isActive: true
          }] : [],
          hierarchy: {},
          createdBy: ledger.createdBy,
          // Ledger-specific fields
          ledgerData: {
            LedgerGUID: ledger.LedgerGUID,
            LedgerName: ledger.LedgerName,
            LedgerMobile: ledger.LedgerMobile,
            Email: ledger.Email,
            LedgerAddress1: ledger.LedgerAddress1,
            LedgerAddress2: ledger.LedgerAddress2,
            LedgerState: ledger.LedgerState,
            LedgerGSTIN: ledger.LedgerGSTIN,
            companyId: ledger.companyId
          },
          isActive: ledger.isActive,
          isLedger: true
        };

        effectiveRole = 'dealers';
      } else {
        // Fetch user details from database for additional context
        user = await User.findById(userId)
          .select('-password')
          .populate('defaultCompany', 'companyName companyCode')
          .populate('companies.companyId', 'companyName companyCode')

        if (!user || !user.isActive) {
          return res.status(401).json({ success: false, message: 'User not found or inactive' })
        }

        effectiveRole = user.role;
      }

      req.user = { 
        ...decoded, 
        userId, 
        role: effectiveRole,
        userDetails: user
      }

      if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
        if (!effectiveRole || !requiredRoles.includes(effectiveRole)) {
          return res.status(403).json({ success: false, message: 'Forbidden: Insufficient role' })
        }
      }

      return next()
    } catch (err) {
      console.error('Auth middleware error:', err)
      return res.status(401).json({ success: false, message: 'Invalid or expired token' })
    }
  }
}

// Company access middleware - ensures user has access to the specified company
export const requireCompanyAccess = (companyIdParam = 'companyId') => {
  return async (req, res, next) => {
    try {
      const companyId = req.params[companyIdParam] || req.body.companyId
      const user = req.user.userDetails

      if (!companyId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Company ID is required' 
        })
      }

      // Super admin has access to all companies
      if (user.role === 'superadmin') {
        return next()
      }

      // Check if user has access to this company
      const hasAccess = user.companies.some(
        comp => comp.companyId._id.toString() === companyId && comp.isActive
      )

      if (!hasAccess) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied: You do not have permission to access this company' 
        })
      }

      req.companyId = companyId
      return next()
    } catch (err) {
      console.error('Company access middleware error:', err)
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking company access' 
      })
    }
  }
}

// Hierarchy access middleware - ensures user can only access data from their hierarchy level and below
export const requireHierarchyAccess = () => {
  return async (req, res, next) => {
    try {
      const user = req.user.userDetails
      const targetUserId = req.params.userId || req.body.userId

      if (!targetUserId) {
        return next() // No specific user target, proceed
      }

      // Super admin can access all users
      if (user.role === 'superadmin') {
        return next()
      }

      // Admin can access users in their company
      if (user.role === 'admin') {
        const targetUser = await User.findById(targetUserId)
          .populate('companies.companyId', '_id')
        
        if (!targetUser) {
          return res.status(404).json({ 
            success: false, 
            message: 'Target user not found' 
          })
        }

        // Check if target user belongs to any of admin's companies
        const hasAccess = targetUser.companies.some(targetComp => 
          user.companies.some(userComp => 
            userComp.companyId._id.toString() === targetComp.companyId._id.toString()
          )
        )

        if (!hasAccess) {
          return res.status(403).json({ 
            success: false, 
            message: 'Access denied: User not in your company hierarchy' 
          })
        }

        return next()
      }

      // For other roles, they can only access their own data
      if (user._id.toString() !== targetUserId) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied: You can only access your own data' 
        })
      }

      return next()
    } catch (err) {
      console.error('Hierarchy access middleware error:', err)
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking hierarchy access' 
      })
    }
  }
}

// Convenience exports
export const requireAuth = authMiddleware()
export const authorizeRoles = (roles = []) => authMiddleware(roles)


