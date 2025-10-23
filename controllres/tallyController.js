import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';

/**
 * @swagger
 * /api/v1/tally/companies:
 *   get:
 *     summary: Get all companies for Tally integration
 *     tags: [Tally Integration]
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 */
export const getCompaniesForTally = async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .select('_id companyName companyCode companyEmail companyMobile guid tallySettings')
      .sort({ companyName: 1 });

    return res.json({
      success: true,
      message: 'Companies retrieved successfully',
      data: companies
    });
    } catch (error) {
    console.error('Error getting companies for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get companies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/tally/company/{companyId}/users:
 *   get:
 *     summary: Get all users for a specific company
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
export const getUsersForTally = async (req, res) => {
  try {
    const { companyId } = req.params;

    const users = await User.find({
      'companies.companyId': companyId,
      'companies.isActive': true
    })
      .select('_id name email mobile role companies hierarchy createdBy createdAt')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .sort({ role: 1, name: 1 });

    return res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        companyId,
        totalUsers: users.length,
        users
      }
    });
  } catch (error) {
    console.error('Error getting users for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/tally/company/{companyId}/hierarchy:
 *   get:
 *     summary: Get company hierarchy structure
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Hierarchy retrieved successfully
 */
export const getCompanyHierarchy = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get all users in the company
    const users = await User.find({
      'companies.companyId': companyId,
      'companies.isActive': true
    })
      .select('_id name email role hierarchy.parentUser')
      .populate('hierarchy.parentUser', 'name email role');

    // Build hierarchy structure
    const hierarchy = buildHierarchyTree(users);

    return res.json({
      success: true,
      message: 'Hierarchy retrieved successfully',
      data: {
        companyId,
        hierarchy
      }
    });
    } catch (error) {
    console.error('Error getting company hierarchy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get hierarchy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/tally/company/{companyId}/statistics:
 *   get:
 *     summary: Get company statistics
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
export const getCompanyStatistics = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Get user statistics
    const userStats = await User.aggregate([
      {
        $match: {
          'companies.companyId': companyId,
          'companies.isActive': true
        }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          users: {
            $push: {
              _id: '$_id',
              name: '$name',
              email: '$email',
              mobile: '$mobile'
            }
          }
        }
      }
    ]);

    const totalUsers = await User.countDocuments({
      'companies.companyId': companyId,
      'companies.isActive': true
    });

    return res.json({
      success: true,
      message: 'Statistics retrieved successfully',
      data: {
        company: {
          _id: company._id,
          companyName: company.companyName,
          companyCode: company.companyCode,
          maxUser: company.maxUser
        },
        statistics: {
          totalUsers,
          usagePercentage: Math.round((totalUsers / company.maxUser) * 100),
          userByRole: userStats
        }
      }
    });
  } catch (error) {
    console.error('Error getting company statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/tally/sync/company/{companyId}:
 *   post:
 *     summary: Sync data from Tally to Royal App
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               syncType:
 *                 type: string
 *                 enum: ['users', 'hierarchy', 'settings']
 *               data:
 *                 type: object
 *                 description: Data to sync from Tally
 *     responses:
 *       200:
 *         description: Data synced successfully
 */
export const syncDataFromTally = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { syncType, data } = req.body;

    if (!syncType || !data) {
      return res.status(400).json({
        success: false,
        message: 'syncType and data are required'
      });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    let result;
    switch (syncType) {
      case 'users':
        result = await syncUsersFromTally(companyId, data);
        break;
      case 'hierarchy':
        result = await syncHierarchyFromTally(companyId, data);
        break;
      case 'settings':
        result = await syncSettingsFromTally(companyId, data);
        break;
      default:
        return res.status(400).json({ 
            success: false, 
          message: 'Invalid sync type. Allowed: users, hierarchy, settings'
        });
    }

    // Update company's last sync time
    await Company.findByIdAndUpdate(companyId, {
      'tallySettings.lastSync': new Date()
    });

    return res.json({
      success: true,
      message: `${syncType} synced successfully`,
      data: result
    });
  } catch (error) {
    console.error('Error syncing data from Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/tally/export/company/{companyId}:
 *   get:
 *     summary: Export company data for Tally
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: ['json', 'xml', 'csv']
 *           default: 'json'
 *         description: Export format
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
export const exportDataForTally = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { format = 'json' } = req.query;

    const company = await Company.findById(companyId)
      .populate('createdBy', 'name email')
      .populate('assignedAdmins.adminId', 'name email');

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    const users = await User.find({
      'companies.companyId': companyId,
      'companies.isActive': true
    })
      .select('_id name email mobile role companies hierarchy createdBy createdAt')
      .populate('hierarchy.parentUser', 'name email role');

    const exportData = {
      company: {
        _id: company._id,
        companyName: company.companyName,
        companyCode: company.companyCode,
        companyEmail: company.companyEmail,
        companyMobile: company.companyMobile,
        guid: company.guid,
        maxUser: company.maxUser,
        contactDetails: company.contactDetails,
        settings: company.settings,
        tallySettings: company.tallySettings,
        createdBy: company.createdBy,
        assignedAdmins: company.assignedAdmins,
        createdAt: company.createdAt
      },
      users: users,
      exportInfo: {
        exportedAt: new Date(),
        totalUsers: users.length,
        format: format
      }
    };

    // Set appropriate content type based on format
    if (format === 'xml') {
      res.setHeader('Content-Type', 'application/xml');
      // Convert to XML (simplified)
      const xmlData = convertToXML(exportData);
      return res.send(xmlData);
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      // Convert to CSV (simplified)
      const csvData = convertToCSV(exportData);
      return res.send(csvData);
    } else {
      // Default JSON
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        message: 'Data exported successfully',
        data: exportData
      });
    }
  } catch (error) {
    console.error('Error exporting data for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper functions
function buildHierarchyTree(users) {
  const userMap = new Map();
  const roots = [];

  // Create user map
  users.forEach(user => {
    userMap.set(user._id.toString(), {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      children: []
    });
  });

  // Build tree structure
  users.forEach(user => {
    const userNode = userMap.get(user._id.toString());
    if (user.hierarchy.parentUser) {
      const parentNode = userMap.get(user.hierarchy.parentUser._id.toString());
      if (parentNode) {
        parentNode.children.push(userNode);
      }
    } else {
      roots.push(userNode);
    }
  });

  return roots;
}

async function syncUsersFromTally(companyId, data) {
  // Implementation for syncing users from Tally
  // This would handle user data updates from Tally
  return { message: 'Users sync not implemented yet', data };
}

async function syncHierarchyFromTally(companyId, data) {
  // Implementation for syncing hierarchy from Tally
  // This would handle hierarchy updates from Tally
  return { message: 'Hierarchy sync not implemented yet', data };
}

async function syncSettingsFromTally(companyId, data) {
  // Implementation for syncing settings from Tally
  // This would handle company settings updates from Tally
  return { message: 'Settings sync not implemented yet', data };
}

function convertToXML(data) {
  // Simple XML conversion (you might want to use a proper XML library)
  return `<?xml version="1.0" encoding="UTF-8"?>
<royalAppData>
  <company>
    <name>${data.company.companyName}</name>
    <code>${data.company.companyCode}</code>
    <totalUsers>${data.exportInfo.totalUsers}</totalUsers>
  </company>
  <exportedAt>${data.exportInfo.exportedAt}</exportedAt>
</royalAppData>`;
}

function convertToCSV(data) {
  // Simple CSV conversion
  let csv = 'Name,Email,Role,Company\n';
  data.users.forEach(user => {
    csv += `"${user.name}","${user.email}","${user.role}","${data.company.companyName}"\n`;
  });
  return csv;
}