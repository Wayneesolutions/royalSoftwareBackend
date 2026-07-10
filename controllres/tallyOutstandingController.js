import Outstanding from '../models/outstanding/outstandingModel.js';
import Company from '../models/company/companyModel.js';

const normalizePaymentTerms = (terms) => {
  if (!terms) return '30_days';
  const valid = ['immediate', '7_days', '15_days', '30_days', '45_days', '60_days', '90_days', 'custom'];
  if (valid.includes(terms)) return terms;
  const s = terms.toString().toLowerCase().replace(/\s+/g, ' ').trim();
  if (s === '0' || s === '0 days' || s === 'immediate') return 'immediate';
  if (s === '7' || s === '7 days') return '7_days';
  if (s === '15' || s === '15 days') return '15_days';
  if (s === '30' || s === '30 days') return '30_days';
  if (s === '45' || s === '45 days') return '45_days';
  if (s === '60' || s === '60 days') return '60_days';
  if (s === '90' || s === '90 days') return '90_days';
  return 'custom';
};
import Ledger from '../models/ledger/ledgerModel.js';
import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import InventoryEntries from '../models/inventory/inventoryEntriesModel.js';
import LedgerEntries from '../models/ledger/ledgerEntriesModel.js';
import User from '../models/user/userModel.js';
import Group from '../models/group/groupModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Create or update outstanding from Tally
 * @route   POST /api/v1/tally/outstanding/sync
 * @access  Public (No auth - Tally integration)
 */
export const syncOutstandingFromTally = async (req, res) => {
  try {
    // Parse body if it's a string (tally routes use text parser)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request body'
        });
      }
    }

    // Support both single object and array
    const outstandingData = Array.isArray(body) ? body : [body];
    const results = [];

    for (let i = 0; i < outstandingData.length; i++) {
      const data = outstandingData[i];
      
      try {
        // Validate required fields
        const requiredFields = ['cmpcode', 'ledgerguid', 'vchguid', 'outstandingAmount'];
        const missingFields = requiredFields.filter(field => !data[field]);

        if (missingFields.length > 0) {
          results.push({
            success: false,
            index: i,
            error: `Missing required fields: ${missingFields.join(', ')}`,
            data: null
          });
          continue;
        }

        // Normalize cmpcode to uppercase to match Company.companyCode storage
        const cmpcode = data.cmpcode.trim().toUpperCase();

        // Find company
        const company = await Company.findOne({
          companyCode: cmpcode,
          isActive: true
        });

        if (!company) {
          results.push({
            success: false,
            index: i,
            error: `Company not found for cmpcode: ${cmpcode}`,
            data: null
          });
          continue;
        }

        // Find ledger (optional — don't hard-fail if not synced yet)
        const ledger = await Ledger.findOne({
          LedgerGUID: data.ledgerguid,
          companyId: company._id,
        });

        // Find voucher (optional but preferred)
        let voucher = null;
        if (data.vchguid) {
          voucher = await VoucherMaster.findOne({
            vchguid: data.vchguid,
            cmpcode: company.companyCode,
            isActive: true
          });
        }

        // Calculate outstanding amount
        const totalAmount = parseFloat(data.totalAmount) || parseFloat(data.outstandingAmount) || 0;
        const paidAmount = parseFloat(data.paidAmount) || 0;
        const outstandingAmount = parseFloat(data.outstandingAmount) || (totalAmount - paidAmount);

        // Calculate due date
        let dueDate = new Date();
        if (data.dueDate) {
          dueDate = new Date(data.dueDate);
        } else if (data.vchdate) {
          const vchDate = new Date(data.vchdate);
          const paymentDays = parseInt(data.paymentDays) || 30;
          dueDate = new Date(vchDate);
          dueDate.setDate(dueDate.getDate() + paymentDays);
        } else if (voucher && voucher.vchdate) {
          const vchDate = new Date(voucher.vchdate);
          dueDate = new Date(vchDate);
          dueDate.setDate(dueDate.getDate() + 30); // Default 30 days
        }

        // Calculate days overdue
        const today = new Date();
        const daysOverdue = Math.max(0, Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24)));

        // Determine status
        let status = 'pending';
        if (outstandingAmount <= 0) {
          status = 'paid';
        } else if (daysOverdue > 0) {
          status = 'overdue';
        } else if (paidAmount > 0 && paidAmount < totalAmount) {
          status = 'partially_paid';
        }

        // Determine risk level
        let riskLevel = 'low';
        if (daysOverdue > 90) {
          riskLevel = 'critical';
        } else if (daysOverdue > 60) {
          riskLevel = 'high';
        } else if (daysOverdue > 30) {
          riskLevel = 'medium';
        }

        // Generate outstanding ID
        const outstandingId = data.outstandingId || `OUT-${data.cmpcode}-${data.vchguid || data.ledgerguid}-${Date.now()}`;

        // Check if outstanding already exists
        const existingOutstanding = await Outstanding.findOne({
          $or: [
            { outstandingId },
            { vchguid: data.vchguid, ledgerguid: data.ledgerguid, cmpcode: data.cmpcode }
          ],
          isActive: true
        });

        const outstandingPayload = {
          outstandingId,
          companyId: company._id,
          partyId: ledger ? ledger._id : null,
          partyName: (ledger ? ledger.LedgerName : null) || data.partyName || data.ledgerguid || 'Unknown',
          partyType: data.partyType || 'dealer',
          partyContact: {
            mobile: (ledger ? ledger.LedgerMobile : null) || data.partyMobile || '',
            email: (ledger ? ledger.Email : null) || data.partyEmail || '',
            address: (ledger ? ledger.LedgerAddress1 : null) || data.partyAddress || ''
          },
          voucherId: voucher ? voucher._id : null,
          vchguid: data.vchguid || null,
          vchnumber: data.vchnumber || (voucher ? voucher.vchnumber : null),
          vchdate: data.vchdate ? new Date(data.vchdate) : (voucher ? voucher.vchdate : new Date()),
          totalAmount,
          paidAmount,
          outstandingAmount,
          currency: data.currency || 'INR',
          paymentTerms: normalizePaymentTerms(data.paymentTerms),
          dueDate,
          creditLimit: parseFloat(data.creditLimit) || 0,
          status,
          daysOverdue,
          lastPaymentDate: data.lastPaymentDate ? new Date(data.lastPaymentDate) : null,
          lastPaymentAmount: parseFloat(data.lastPaymentAmount) || 0,
          riskLevel,
          riskFactors: data.riskFactors || [],
          tallyGUID: data.tallyGUID || data.outstandingId,
          tallySyncStatus: 'synced',
          tallySyncAt: new Date(),
          isActive: true
        };

        let savedOutstanding;
        if (existingOutstanding) {
          // Update existing
          Object.assign(existingOutstanding, outstandingPayload);
          savedOutstanding = await existingOutstanding.save();
          results.push({
            success: true,
            index: i,
            action: 'Updated',
            data: {
              _id: savedOutstanding._id,
              outstandingId: savedOutstanding.outstandingId,
              partyName: savedOutstanding.partyName,
              outstandingAmount: savedOutstanding.outstandingAmount,
              status: savedOutstanding.status
            }
          });
        } else {
          // Create new
          // For Tally sync, we need a createdBy - use first admin or system user
          const adminUser = await User.findOne({
            role: 'admin',
            'companies.companyId': company._id,
            isActive: true
          }).select('_id');

          outstandingPayload.createdBy = adminUser ? adminUser._id : company._id;
          
          savedOutstanding = await Outstanding.create(outstandingPayload);
          results.push({
            success: true,
            index: i,
            action: 'Created',
            data: {
              _id: savedOutstanding._id,
              outstandingId: savedOutstanding.outstandingId,
              partyName: savedOutstanding.partyName,
              outstandingAmount: savedOutstanding.outstandingAmount,
              status: savedOutstanding.status
            }
          });
        }

      } catch (error) {
        console.error(`Error processing outstanding entry ${i}:`, error);
        results.push({
          success: false,
          index: i,
          error: error.message,
          data: null
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    const statusCode = failedCount === 0 ? 200 : (successCount > 0 ? 207 : 400);

    res.status(statusCode).json({
      success: failedCount === 0,
      message: `Outstanding sync completed. Success: ${successCount}, Failed: ${failedCount}`,
      data: {
        results,
        summary: {
          totalProcessed: results.length,
          totalSuccess: successCount,
          totalFailed: failedCount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error syncing outstanding from Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync outstanding from Tally',
      error: error.message
    });
  }
};

/**
 * @desc    Get outstanding for group user (own ledgers + child group dealers)
 * @route   GET /api/v1/tally/outstanding/group-user
 * @access  Public (No auth - Tally integration)
 */
export const getOutstandingForGroupUser = async (req, res) => {
  try {
    const { cmpcode: rawCmpcode, userId } = req.query;

    console.log(`🔍 getOutstandingForGroupUser called with cmpcode: ${rawCmpcode}, userId: ${userId}`);

    if (!rawCmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID (userId) is required'
      });
    }

    const cmpcode = rawCmpcode.trim().toUpperCase();

    // Find company
    const company = await Company.findOne({
      companyCode: cmpcode,
      isActive: true
    });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company not found for cmpcode: ${cmpcode}`
      });
    }

    // Find user - IMPORTANT: Include assignedDealerIds to get directly assigned dealers
    const user = await User.findById(userId).select('groups hierarchy role assignedDealerIds');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('========================================');
    console.log('👤 USER DETAILS');
    console.log('========================================');
    console.log(`👤 User ID: ${userId}`);
    console.log(`👤 User Role: ${user.role}`);
    console.log(`👤 User Groups Count: ${user.groups?.length || 0}`);
    console.log(`👤 Directly Assigned Dealers Count: ${user.assignedDealerIds?.length || 0}`);
    if (user.assignedDealerIds && user.assignedDealerIds.length > 0) {
      console.log(`👤 Assigned Dealer IDs:`, user.assignedDealerIds.map(id => id.toString()));
    }
    console.log('========================================');

    // Get all ledger GUIDs for this group user (own + child groups)
    const ledgerGUIDs = new Set();

    // Helper function to get all child user IDs recursively
    // Added depth limit and visited set to prevent infinite loops
    const getAllChildUserIdsRecursive = async (parentUserId, visited = new Set(), depth = 0, maxDepth = 10) => {
      // Prevent infinite recursion
      if (depth > maxDepth) {
        console.log(`⚠️ Max recursion depth (${maxDepth}) reached for parent: ${parentUserId}`);
        return [];
      }
      
      const parentIdStr = parentUserId.toString();
      // Prevent circular references
      if (visited.has(parentIdStr)) {
        console.log(`⚠️ Circular reference detected for parent: ${parentIdStr}`);
        return [];
      }
      visited.add(parentIdStr);
      
      const childUserIds = [];
      const parentId = mongoose.Types.ObjectId.isValid(parentUserId) 
        ? (typeof parentUserId === 'string' ? new mongoose.Types.ObjectId(parentUserId) : parentUserId)
        : parentUserId;
      
      try {
        console.log(`🔍 [Depth ${depth}] Finding children for parent: ${parentIdStr}`);
        const startTime = Date.now();
        
        // Fixed: Combined $or conditions properly using $and
        // MongoDB doesn't support nested $or - must use $and to combine
        const directChildren = await User.find({
          $and: [
            {
              $or: [
                { 'hierarchy.parentUserId': parentId },
                { 'hierarchy.parentUser': parentId }
              ]
            },
            {
              $or: [
                { 'companies.companyId': company._id },
                { defaultCompany: company._id }
              ]
            },
            { isActive: true }
          ]
        })
        .select('_id groups')
        .lean()
        .maxTimeMS(5000); // 5 second timeout per query
        
        const queryTime = Date.now() - startTime;
        console.log(`✅ [Depth ${depth}] Found ${directChildren.length} direct children in ${queryTime}ms`);
        
        if (directChildren.length === 0) {
          return [];
        }
        
        const directChildIds = directChildren.map(child => child._id.toString());
        childUserIds.push(...directChildIds);
        console.log(`📋 [Depth ${depth}] Direct child IDs:`, directChildIds);
        
        // Process children in parallel with Promise.all for better performance
        const nestedPromises = directChildIds.map(async (childId) => {
          try {
            return await getAllChildUserIdsRecursive(childId, visited, depth + 1, maxDepth);
          } catch (error) {
            console.error(`❌ Error getting nested children for ${childId}:`, error.message);
            return [];
          }
        });
        
        const nestedResults = await Promise.all(nestedPromises);
        nestedResults.forEach(nestedChildren => {
          childUserIds.push(...nestedChildren);
        });
        
        console.log(`✅ [Depth ${depth}] Total child IDs collected: ${childUserIds.length}`);
        return childUserIds;
      } catch (error) {
        console.error(`❌ Error in getAllChildUserIdsRecursive at depth ${depth}:`, error.message);
        return [];
      }
    };

    // Get user's own groups
    const userGroups = user.groups || [];
    const userActiveGroups = userGroups.filter(g => g.isActive && g.cmpcode === cmpcode);
    console.log('userActiveGroups================',userActiveGroups.map(g => ({
      groupGUID: g.groupGUID,
      groupName: g.groupName,
      groupId: g.groupId?.toString()
    })));
    
    // Get child user IDs
    console.log('🔍 Starting to get child user IDs...');
    const childUserStartTime = Date.now();
    const childUserIds = await getAllChildUserIdsRecursive(userId);
    const childUserTime = Date.now() - childUserStartTime;
    console.log(`✅ Got ${childUserIds.length} child user IDs in ${childUserTime}ms`);
    console.log('childUserIds================',childUserIds);
    const allUserIds = [userId, ...childUserIds];
    console.log('allUserIds================',allUserIds);
    
    // Collect all groupGUIDs (own + child users) - SAME AS LEDGER REPORT
    // We'll use groupGUID to find Group documents, then use their _id to query dealers
    const allGroupGUIDs = new Set();
    
    // Add user's own group GUIDs
    userActiveGroups.forEach(group => {
      if (group.groupGUID) {
        allGroupGUIDs.add(group.groupGUID);
      }
    });
    console.log('userGroupGUIDs================',Array.from(allGroupGUIDs));
    
    // Get groups from child users
    if (childUserIds.length > 0) {
      const childUsers = await User.find({
        _id: { $in: childUserIds },
        isActive: true
      }).select('groups').lean();

      childUsers.forEach(childUser => {
        (childUser.groups || []).forEach(group => {
          if (group.isActive && group.cmpcode === cmpcode && group.groupGUID) {
            allGroupGUIDs.add(group.groupGUID);
          }
        });
      });
    }
    
    console.log('allGroupGUIDs================',Array.from(allGroupGUIDs));
    
    // Get all ledgers from these groups (EXACT SAME LOGIC AS LEDGER REPORT)
    // Flow: GroupGUID → Find Group Document → Recursively find child groups → Use all group _id to query dealers
    // Two types: User dealers (role='dealers') + Ledger dealers (Ledger model with groupId)
    if (allGroupGUIDs.size > 0) {
      console.log('========================================');
      console.log('🔍 GETTING DEALERS FROM GROUPS (INCLUDING CHILD GROUPS)');
      console.log('========================================');
      console.log(`📋 Initial Group GUIDs:`, Array.from(allGroupGUIDs));
      console.log(`📋 Company ID:`, company._id.toString());
      console.log(`📋 Company Code:`, cmpcode);
      
      // Step 1: Find Group documents by GroupGUID (same as ledger report)
      const initialGroupDocs = await Group.find({
        GroupGUID: { $in: Array.from(allGroupGUIDs) },
        cmpcode: cmpcode,
        isActive: true
      }).select('_id GroupGUID GroupName').lean();
      
      console.log(`📋 Found ${initialGroupDocs.length} initial Group documents`);
      if (initialGroupDocs.length > 0) {
        console.log('Initial Group documents:', initialGroupDocs.map(g => ({
          _id: g._id.toString(),
          GroupGUID: g.GroupGUID,
          GroupName: g.GroupName
        })));
      }
      
      if (initialGroupDocs.length === 0) {
        console.log('⚠️ No Group documents found for the provided Group GUIDs');
        console.log('⚠️ Group GUIDs searched:', Array.from(allGroupGUIDs));
      } else {
        // Step 2: Recursively find all child groups (same as ledger report)
        const allGroupObjectIds = new Set();
        const visitedGroupIds = new Set();
        const groupGUIDMap = new Map(); // Map group _id to GroupGUID
        
        // Initialize with initial groups
        initialGroupDocs.forEach(g => {
          allGroupObjectIds.add(g._id);
          visitedGroupIds.add(g._id.toString());
          groupGUIDMap.set(g._id.toString(), g.GroupGUID);
        });
        
        // Helper function to recursively find child groups
        const findAllChildGroups = async (parentGroupIds) => {
          if (parentGroupIds.length === 0) return;
          
          // Get users in these groups (to find child groups via GroupParent)
          const usersInGroups = await User.find({
            'groups.groupId': { $in: parentGroupIds },
            'groups.isActive': true,
            'companies.companyId': company._id,
            isActive: true
          }).select('_id').lean();
          
          const userIdsInGroups = usersInGroups.map(u => u._id.toString());
          
          // Get group GUIDs for current parent groups
          const parentGroupGUIDs = parentGroupIds
            .map(id => groupGUIDMap.get(id.toString()))
            .filter(guid => guid);
          
          // Find child groups where GroupParent matches user IDs OR group GUIDs
          const childGroups = await Group.find({
            GroupParent: { $in: [...userIdsInGroups, ...parentGroupGUIDs] },
            _id: { $nin: Array.from(visitedGroupIds) }, // Prevent infinite loops
            cmpcode: cmpcode,
            companyId: company._id,
            isActive: true
          }).select('_id GroupGUID GroupName').lean();
          
          if (childGroups.length > 0) {
            console.log(`📋 Found ${childGroups.length} child groups`);
            const childGroupIds = childGroups.map(g => g._id);
            
            childGroupIds.forEach(id => {
              allGroupObjectIds.add(id);
              visitedGroupIds.add(id.toString());
            });
            
            // Store GUIDs for these child groups
            childGroups.forEach(g => {
              groupGUIDMap.set(g._id.toString(), g.GroupGUID);
            });
            
            // Recursively find children of these child groups
            await findAllChildGroups(childGroupIds);
          }
        };
        
        // Find all child groups recursively
        const initialGroupIds = initialGroupDocs.map(g => g._id);
        await findAllChildGroups(initialGroupIds);
        
        const finalGroupObjectIds = Array.from(allGroupObjectIds);
        console.log(`📋 Total groups (own + child groups): ${finalGroupObjectIds.length}`);
        console.log('Final Group ObjectIds:', finalGroupObjectIds.map(id => id.toString()));
        
        // Step 3: Get User dealers (users with role='dealers' in these groups)
        const userDealersInGroups = await User.find({
          role: 'dealers',
          'groups.groupId': { $in: finalGroupObjectIds },
          'groups.isActive': true,
          'companies.companyId': company._id,
          'companies.isActive': true,
          isActive: true
        }).select('_id name email mobile').lean();
        
        console.log(`👥 Found ${userDealersInGroups.length} user dealers in these groups`);
        if (userDealersInGroups.length > 0) {
          console.log('👥 User dealers:', userDealersInGroups.map(u => ({
            _id: u._id.toString(),
            name: u.name,
            email: u.email
          })));
        }
        
        // Step 4: Get Ledger dealers (Ledger documents with groupId matching these groups)
        const ledgerDealersInGroups = await Ledger.find({
          groupId: { $in: finalGroupObjectIds },
          companyId: company._id,
          isActive: true
        }).select('LedgerGUID LedgerName LedgerMobile Email groupId').lean();
        
        console.log(`📊 Found ${ledgerDealersInGroups.length} ledger dealers in these groups`);
        console.log('ledgers================',ledgerDealersInGroups.map(l => ({ 
          _id: l._id?.toString(),
          LedgerGUID: l.LedgerGUID, 
          LedgerName: l.LedgerName,
          LedgerMobile: l.LedgerMobile,
          Email: l.Email,
          groupId: l.groupId?.toString()
        })));
        console.log('========================================');
        
        // Add all ledger GUIDs from ledger dealers
        ledgerDealersInGroups.forEach(ledger => {
          if (ledger.LedgerGUID) {
            ledgerGUIDs.add(ledger.LedgerGUID);
          }
        });
        
        // Note: User dealers (role='dealers') are User documents, not Ledger documents
        // They don't have LedgerGUID, so we can't use them for outstanding matching
        // Outstanding entries are linked to Ledger model via ledgerguid
        if (userDealersInGroups.length > 0) {
          console.log(`ℹ️ Found ${userDealersInGroups.length} user dealers, but they don't have LedgerGUID for outstanding matching`);
        }
      }
    } else {
      console.log('⚠️ No group GUIDs found for user and child users');
    }

    // Get ledgers from TWO sources:
    // 1. Directly assigned dealers (admin assigned via assignedDealerIds)
    // 2. User-created dealers (user created via createdBy field)
    console.log('========================================');
    console.log('🔍 QUERYING DIRECTLY ASSIGNED & USER-CREATED LEDGERS');
    console.log('========================================');
    console.log(`📋 User IDs to search (own + child users):`, allUserIds);
    console.log(`📋 Assigned dealer IDs from user (admin assigned):`, user.assignedDealerIds || []);
    console.log(`📋 Company ID:`, company._id.toString());
    
    // Convert assigned dealer IDs to ObjectIds (handle both populated and non-populated)
    let assignedDealerObjectIds = [];
    if (user.assignedDealerIds && Array.isArray(user.assignedDealerIds) && user.assignedDealerIds.length > 0) {
      assignedDealerObjectIds = user.assignedDealerIds
        .map(id => {
          if (typeof id === 'object' && id !== null && id._id) {
            return id._id;
          } else if (mongoose.Types.ObjectId.isValid(id)) {
            return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
          }
          return null;
        })
        .filter(id => id !== null);
      console.log(`📋 Converted assigned dealer ObjectIds:`, assignedDealerObjectIds.map(id => id.toString()));
    }
    
    // Convert user IDs to ObjectIds for query
    const userObjectIds = allUserIds.map(id => 
      mongoose.Types.ObjectId.isValid(id) ? (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) : id
    );
    
    // Query 1: Get dealers created by user (or child users)
    const userCreatedLedgers = await Ledger.find({
      createdBy: { $in: userObjectIds },
      companyId: company._id,
      isActive: true
    }).select('LedgerGUID LedgerName createdBy').lean();
    
    console.log(`📊 Found ${userCreatedLedgers.length} user-created ledgers`);
    if (userCreatedLedgers.length > 0) {
      console.log('userCreatedLedgers================',userCreatedLedgers.map(l => ({
        _id: l._id?.toString(),
        LedgerGUID: l.LedgerGUID,
        LedgerName: l.LedgerName,
        createdBy: l.createdBy?.toString(),
        source: 'user-created'
      })));
    }
    
    // Query 2: Get directly assigned dealers (admin assigned)
    let directlyAssignedLedgers = [];
    if (assignedDealerObjectIds.length > 0) {
      directlyAssignedLedgers = await Ledger.find({
        _id: { $in: assignedDealerObjectIds },
        companyId: company._id,
        isActive: true
      }).select('LedgerGUID LedgerName createdBy').lean();
      
      console.log(`📊 Found ${directlyAssignedLedgers.length} directly assigned ledgers (admin assigned)`);
      if (directlyAssignedLedgers.length > 0) {
        console.log('directlyAssignedLedgers================',directlyAssignedLedgers.map(l => ({
          _id: l._id?.toString(),
          LedgerGUID: l.LedgerGUID,
          LedgerName: l.LedgerName,
          createdBy: l.createdBy?.toString(),
          source: 'admin-assigned'
        })));
      }
    } else {
      console.log('ℹ️ No directly assigned dealers found (assignedDealerIds is empty)');
    }
    
    // Combine both types and remove duplicates
    const allDirectLedgers = [...userCreatedLedgers, ...directlyAssignedLedgers];
    const uniqueDirectLedgers = allDirectLedgers.filter((ledger, index, self) =>
      index === self.findIndex(l => l._id.toString() === ledger._id.toString())
    );
    
    console.log(`📊 Total unique direct ledgers (user-created + admin-assigned): ${uniqueDirectLedgers.length}`);
    console.log('========================================');

    // Add all ledger GUIDs
    uniqueDirectLedgers.forEach(ledger => {
      if (ledger.LedgerGUID) {
        ledgerGUIDs.add(ledger.LedgerGUID);
      }
    });
    
    // Also get assigned dealers from child users (same as getAllDealers logic)
    if (childUserIds.length > 0) {
      console.log('========================================');
      console.log('🔍 QUERYING ASSIGNED DEALERS FROM CHILD USERS');
      console.log('========================================');
      console.log(`📋 Child User IDs:`, childUserIds);
      
      const childUsers = await User.find({
        _id: { $in: childUserIds },
        isActive: true
      }).select('assignedDealerIds').lean();
      
      const allChildAssignedDealerIds = [];
      childUsers.forEach(childUser => {
        if (childUser.assignedDealerIds && Array.isArray(childUser.assignedDealerIds)) {
          childUser.assignedDealerIds.forEach(dealerId => {
            const dealerIdObj = typeof dealerId === 'object' && dealerId !== null && dealerId._id
              ? dealerId._id
              : (mongoose.Types.ObjectId.isValid(dealerId) 
                  ? (typeof dealerId === 'string' ? new mongoose.Types.ObjectId(dealerId) : dealerId)
                  : null);
            if (dealerIdObj) {
              allChildAssignedDealerIds.push(dealerIdObj);
            }
          });
        }
      });
      
      console.log(`📋 Total assigned dealer IDs from child users: ${allChildAssignedDealerIds.length}`);
      
      if (allChildAssignedDealerIds.length > 0) {
        const childAssignedLedgers = await Ledger.find({
          _id: { $in: allChildAssignedDealerIds },
          companyId: company._id,
          isActive: true
        }).select('LedgerGUID LedgerName').lean();
        
        console.log(`📊 Found ${childAssignedLedgers.length} ledgers from child users' assigned dealers`);
        console.log('childAssignedLedgers================',childAssignedLedgers.map(l => ({
          LedgerGUID: l.LedgerGUID,
          LedgerName: l.LedgerName
        })));
        
        childAssignedLedgers.forEach(ledger => {
          if (ledger.LedgerGUID) {
            ledgerGUIDs.add(ledger.LedgerGUID);
          }
        });
      }
      console.log('========================================');
    }

    // Get outstanding entries for these ledgers
    const ledgerGUIDsArray = Array.from(ledgerGUIDs);
    
    if (ledgerGUIDsArray.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No ledgers found for this group user',
        data: {
          ledgers: [],
          outstanding: [],
          summary: {
            totalLedgers: 0,
            totalOutstanding: 0,
            totalInvoices: 0
          }
        }
      });
    }
   
    // Get ledgers with details
    const ledgersWithDetails = await Ledger.find({
      LedgerGUID: { $in: ledgerGUIDsArray },
      companyId: company._id,
      isActive: true
    }).select('LedgerGUID LedgerName LedgerMobile Email').lean();

    console.log('========================================');
    console.log('📋 ALL DEALERS FOUND (OWN + CHILD GROUPS)');
    console.log('========================================');
    console.log(`📊 Total dealers found: ${ledgersWithDetails.length}`);
    console.log(`📋 Ledger GUIDs being searched:`, ledgerGUIDsArray);
    if (ledgersWithDetails.length > 0) {
      ledgersWithDetails.forEach((ledger, idx) => {
        console.log(`\n📋 Dealer ${idx + 1}:`, {
          _id: ledger._id?.toString() || 'N/A',
          LedgerGUID: ledger.LedgerGUID || 'MISSING',
          LedgerName: ledger.LedgerName || 'N/A',
          LedgerMobile: ledger.LedgerMobile || 'N/A',
          Email: ledger.Email || 'N/A'
        });
      });
    } else {
      console.log('⚠️ No dealers found for the provided ledger GUIDs');
      console.log('⚠️ Ledger GUIDs searched:', ledgerGUIDsArray);
    }
    console.log('========================================');

    // Get outstanding entries for this company (all outstanding entries)
    // We'll match them to ledgers based on partyId or voucher party GUID
    const ledgerIds = ledgersWithDetails.map(l => l._id);
    
    // Get vouchers for these ledgers to find vchpartyguid
    const vouchers = await VoucherMaster.find({
      vchpartyguid: { $in: ledgerGUIDsArray },
      cmpcode: cmpcode,
      isActive: true
    }).select('vchguid vchpartyguid').lean();
    
    const voucherGUIDs = vouchers.map(v => v.vchguid);
    
    // Get ALL outstanding entries for this company (we'll filter by matching ledgers)
    // Use both direct query and populate to ensure we catch all matches
    const allOutstandingEntries = await Outstanding.find({
      companyId: company._id,
      isActive: true,
      outstandingAmount: { $gt: 0 }
    })
      .populate({
        path: 'voucherId',
        select: 'vchnumber vchdate vchtype vchamount vchpartyguid',
        options: { lean: true }
      })
      .populate({
        path: 'partyId',
        select: 'LedgerGUID LedgerName LedgerMobile Email',
        options: { lean: true }
      })
      .sort({ dueDate: 1 })
      .lean();
    
    console.log('========================================');
    console.log('📊 ALL OUTSTANDING ENTRIES IN DATABASE (BEFORE FILTERING)');
    console.log('========================================');
    console.log(`📊 Total outstanding entries found in company: ${allOutstandingEntries.length}`);
    console.log(`📋 Looking for ${ledgerGUIDsArray.length} ledger GUIDs:`, ledgerGUIDsArray);
    console.log(`📋 Ledger IDs to match:`, ledgerIds.slice(0, 5).map(id => id.toString()), ledgerIds.length > 5 ? '...' : '');
    
    if (allOutstandingEntries.length > 0) {
      console.log('\n📄 All Outstanding Entries:');
      allOutstandingEntries.forEach((entry, idx) => {
        const partyIdInfo = entry.partyId 
          ? (typeof entry.partyId === 'object' 
              ? { 
                  _id: entry.partyId._id?.toString() || 'N/A',
                  LedgerGUID: entry.partyId.LedgerGUID || 'NOT POPULATED',
                  LedgerName: entry.partyId.LedgerName || 'N/A'
                }
              : entry.partyId.toString())
          : 'NOT POPULATED';
        
        console.log(`\n  📄 Outstanding Entry ${idx + 1}/${allOutstandingEntries.length}:`, {
          _id: entry._id?.toString() || 'N/A',
          outstandingId: entry.outstandingId || 'N/A',
          ledgerguid: entry.ledgerguid || '❌ MISSING',
          partyId: partyIdInfo,
          partyName: entry.partyName || 'N/A',
          vchguid: entry.vchguid || 'N/A',
          vchnumber: entry.vchnumber || (entry.voucherId?.vchnumber) || 'N/A',
          outstandingAmount: entry.outstandingAmount || 0,
          status: entry.status || 'N/A',
          dueDate: entry.dueDate || 'N/A',
          voucherPartyGUID: entry.voucherId?.vchpartyguid || 'N/A'
        });
      });
    } else {
      console.log('⚠️ No outstanding entries found in database for this company');
    }
    console.log('========================================');
    
    // Also query directly by partyId to ensure we catch all matches
    const directOutstandingEntries = await Outstanding.find({
      companyId: company._id,
      partyId: { $in: ledgerIds },
      isActive: true,
      outstandingAmount: { $gt: 0 }
    })
      .populate({
        path: 'voucherId',
        select: 'vchnumber vchdate vchtype vchamount vchpartyguid',
        options: { lean: true }
      })
      .populate({
        path: 'partyId',
        select: 'LedgerGUID LedgerName LedgerMobile Email',
        options: { lean: true }
      })
      .sort({ dueDate: 1 })
      .lean();
    
    console.log(`📊 Found ${directOutstandingEntries.length} outstanding entries by direct partyId match`);
    
    // Combine both results and remove duplicates
    const combinedEntries = [...allOutstandingEntries, ...directOutstandingEntries];
    const uniqueEntries = combinedEntries.filter((entry, index, self) =>
      index === self.findIndex(e => e._id.toString() === entry._id.toString())
    );
    
    console.log(`📊 Combined unique entries: ${uniqueEntries.length}`);
    
    // Log all outstanding entries with their ledger GUIDs for comparison
    console.log('========================================');
    console.log('📊 ALL OUTSTANDING ENTRIES WITH LEDGER GUIDs (BEFORE FILTERING)');
    console.log('========================================');
    if (uniqueEntries.length > 0) {
      uniqueEntries.forEach((entry, idx) => {
        const entryLedgerGUID = entry.ledgerguid || 
                                entry.partyId?.LedgerGUID || 
                                entry.voucherId?.vchpartyguid || 
                                '❌ NO LEDGER GUID FOUND';
        
        console.log(`\n  📄 Entry ${idx + 1}/${uniqueEntries.length}:`, {
          outstandingId: entry.outstandingId || entry._id?.toString() || 'N/A',
          partyName: entry.partyName || 'N/A',
          outstandingAmount: entry.outstandingAmount || 0,
          '🔑 LEDGER GUID': entryLedgerGUID,
          '🔍 In Search List?': ledgerGUIDsArray.includes(entryLedgerGUID) ? '✅ YES' : '❌ NO',
          partyId_LedgerGUID: entry.partyId?.LedgerGUID || 'NOT POPULATED',
          voucherPartyGUID: entry.voucherId?.vchpartyguid || 'N/A',
          ledgerguid_field: entry.ledgerguid || '❌ MISSING'
        });
      });
    } else {
      console.log('⚠️ No outstanding entries found in database');
    }
    console.log('========================================');
    console.log(`📋 Searching for these Ledger GUIDs:`, ledgerGUIDsArray);
    console.log('========================================');
    
    // Filter outstanding entries that match our ledgers
    const outstandingEntries = uniqueEntries.filter(entry => {
      // Match by partyId (ledger _id) - this is the primary match
      if (entry.partyId) {
        let partyIdToMatch = null;
        
        // If partyId is an object (populated), use its _id
        if (typeof entry.partyId === 'object' && entry.partyId !== null) {
          if (entry.partyId._id) {
            partyIdToMatch = entry.partyId._id.toString();
          } else if (entry.partyId.toString) {
            // It's a Mongoose ObjectId
            partyIdToMatch = entry.partyId.toString();
          }
        } 
        // If partyId is already a string/ObjectId, use it directly
        else if (typeof entry.partyId === 'string' || (entry.partyId && entry.partyId.toString)) {
          partyIdToMatch = entry.partyId.toString();
        }
        
        // Match by partyId ObjectId
        if (partyIdToMatch) {
          const matched = ledgerIds.some(id => id.toString() === partyIdToMatch);
          if (matched) {
            console.log(`✅ Matched outstanding ${entry.outstandingId || entry._id} by partyId ObjectId: ${partyIdToMatch}`);
            return true;
          }
        }
        
        // Match by partyId LedgerGUID (if populated)
        if (typeof entry.partyId === 'object' && entry.partyId !== null && entry.partyId.LedgerGUID) {
          if (ledgerGUIDsArray.includes(entry.partyId.LedgerGUID)) {
            console.log(`✅ Matched outstanding ${entry.outstandingId || entry._id} by partyId.LedgerGUID: ${entry.partyId.LedgerGUID}`);
            return true;
          }
        }
      }
      
      // Match by voucher's party GUID
      if (entry.voucherId && entry.voucherId.vchpartyguid) {
        if (ledgerGUIDsArray.includes(entry.voucherId.vchpartyguid)) {
          console.log(`✅ Matched outstanding ${entry.outstandingId || entry._id} by voucher party GUID: ${entry.voucherId.vchpartyguid}`);
          return true;
        }
      }
      
      // Match by vchguid if it's in our voucher list
      if (entry.vchguid && voucherGUIDs.includes(entry.vchguid)) {
        console.log(`✅ Matched outstanding ${entry.outstandingId || entry._id} by vchguid: ${entry.vchguid}`);
        return true;
      }
      
      // Match by party contact mobile
      if (entry.partyContact && entry.partyContact.mobile) {
        const matchingLedger = ledgersWithDetails.find(l => 
          l.LedgerMobile === entry.partyContact.mobile
        );
        if (matchingLedger) {
          console.log(`✅ Matched outstanding ${entry.outstandingId || entry._id} by mobile: ${entry.partyContact.mobile}`);
          return true;
        }
      }
      
      // Match by partyName
      if (entry.partyName) {
        const matchingLedger = ledgersWithDetails.find(l => 
          l.LedgerName === entry.partyName
        );
        if (matchingLedger) {
          console.log(`✅ Matched outstanding ${entry.outstandingId || entry._id} by partyName: ${entry.partyName}`);
          return true;
        }
      }
      
      return false;
    });
    
    console.log(`✅ Filtered to ${outstandingEntries.length} outstanding entries matching group user ledgers`);

    // Group outstanding by ledger
    const outstandingByLedger = {};
    
    ledgersWithDetails.forEach(ledger => {
      outstandingByLedger[ledger.LedgerGUID] = {
        ledger: {
          _id: ledger._id,
          LedgerGUID: ledger.LedgerGUID,
          LedgerName: ledger.LedgerName,
          LedgerMobile: ledger.LedgerMobile,
          Email: ledger.Email
        },
        outstanding: [],
        totalOutstanding: 0,
        invoiceCount: 0,
        maxOverdueDays: 0,
        lastActivity: null
      };
    });

    // Map outstanding to ledgers
    outstandingEntries.forEach(entry => {
      let matchedLedgerGUID = null;
      
      // First try to match by partyId (direct ledger reference) - check both _id and LedgerGUID
      if (entry.partyId) {
        // Check if partyId._id matches any of our ledger IDs
        if (entry.partyId._id) {
          const partyIdStr = entry.partyId._id.toString();
          const matchingLedger = ledgersWithDetails.find(l => l._id.toString() === partyIdStr);
          if (matchingLedger) {
            matchedLedgerGUID = matchingLedger.LedgerGUID;
          }
        }
        
        // Also check LedgerGUID from populated partyId
        if (!matchedLedgerGUID && entry.partyId.LedgerGUID && ledgerGUIDsArray.includes(entry.partyId.LedgerGUID)) {
          matchedLedgerGUID = entry.partyId.LedgerGUID;
        }
      }
      
      // If not found, try to match by voucher's party GUID
      if (!matchedLedgerGUID && entry.voucherId && entry.voucherId.vchpartyguid) {
        if (ledgerGUIDsArray.includes(entry.voucherId.vchpartyguid)) {
          matchedLedgerGUID = entry.voucherId.vchpartyguid;
        }
      }
      
      // If still not found, try to match by vchguid (if vchguid is a ledger GUID)
      if (!matchedLedgerGUID && entry.vchguid && ledgerGUIDsArray.includes(entry.vchguid)) {
        matchedLedgerGUID = entry.vchguid;
      }
      
      // Also try to match by party contact mobile
      if (!matchedLedgerGUID && entry.partyContact && entry.partyContact.mobile) {
        const matchingLedger = ledgersWithDetails.find(l => 
          l.LedgerMobile === entry.partyContact.mobile
        );
        if (matchingLedger) {
          matchedLedgerGUID = matchingLedger.LedgerGUID;
        }
      }
      
      // Also try to match by partyName (if it matches ledger name)
      if (!matchedLedgerGUID && entry.partyName) {
        const matchingLedger = ledgersWithDetails.find(l => 
          l.LedgerName === entry.partyName
        );
        if (matchingLedger) {
          matchedLedgerGUID = matchingLedger.LedgerGUID;
        }
      }

      if (matchedLedgerGUID && outstandingByLedger[matchedLedgerGUID]) {
        outstandingByLedger[matchedLedgerGUID].outstanding.push({
          _id: entry._id,
          outstandingId: entry.outstandingId,
          vchguid: entry.vchguid,
          vchnumber: entry.vchnumber || (entry.voucherId ? entry.voucherId.vchnumber : null),
          vchdate: entry.vchdate,
          amount: entry.outstandingAmount,
          totalAmount: entry.totalAmount,
          paidAmount: entry.paidAmount,
          dueDate: entry.dueDate,
          overdueDays: entry.daysOverdue,
          status: entry.status,
          riskLevel: entry.riskLevel
        });

        outstandingByLedger[matchedLedgerGUID].totalOutstanding += entry.outstandingAmount;
        outstandingByLedger[matchedLedgerGUID].invoiceCount += 1;
        outstandingByLedger[matchedLedgerGUID].maxOverdueDays = Math.max(
          outstandingByLedger[matchedLedgerGUID].maxOverdueDays,
          entry.daysOverdue || 0
        );

        if (entry.vchdate) {
          const entryDate = new Date(entry.vchdate);
          if (!outstandingByLedger[matchedLedgerGUID].lastActivity || 
              entryDate > new Date(outstandingByLedger[matchedLedgerGUID].lastActivity)) {
            outstandingByLedger[matchedLedgerGUID].lastActivity = entry.vchdate;
          }
        }
      }
    });

    // Helper function to format date as "DD MMM YY"
    const formatDate = (dateStr) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[date.getMonth()];
      const year = String(date.getFullYear()).slice(-2);
      return `${day} ${month} ${year}`;
    };

    // Convert to array and format - EXACT structure matching frontend LEDGER_GROUPS
    const ledgerGroupsArray = [];
    const billsData = {};
    
    const ledgerEntries = Object.values(outstandingByLedger).filter(item => item.outstanding.length > 0);
    
    for (let index = 0; index < ledgerEntries.length; index++) {
      const item = ledgerEntries[index];
      const ledgerId = String(index + 1);
      
      // Format lastActivity date
      const lastActivityFormatted = formatDate(item.lastActivity);
      
      // Add to LEDGER_GROUPS array
      ledgerGroupsArray.push({
        id: ledgerId,
        name: item.ledger.LedgerName,
        outstanding: item.totalOutstanding,
        invoiceCount: item.invoiceCount,
        overdueDays: item.maxOverdueDays,
        lastActivity: lastActivityFormatted
      });
      
      // Process bills for this ledger
      billsData[ledgerId] = [];
      
      for (let billIndex = 0; billIndex < item.outstanding.length; billIndex++) {
        const bill = item.outstanding[billIndex];
        
        // Get items from inventory entries for this voucher
        let itemsString = 'N/A';
        if (bill.vchguid) {
          const inventoryEntries = await InventoryEntries.find({
            vchguid: bill.vchguid,
            cmpcode: cmpcode,
            isActive: true
          }).select('itemdescription itemmainqty itemmainunit').lean();

          if (inventoryEntries.length > 0) {
            itemsString = inventoryEntries.map(inv => 
              `${inv.itemdescription || 'Item'} (${inv.itemmainqty || 0} ${inv.itemmainunit || ''})`
            ).join(', ');
          }
        }

        billsData[ledgerId].push({
          id: String(billIndex + 1),
          date: formatDate(bill.vchdate),
          voucherNo: bill.vchnumber || 'N/A',
          amount: bill.amount,
          dueDate: formatDate(bill.dueDate),
          overdueDays: bill.overdueDays || 0,
          items: itemsString
        });
      }
    }
    
    // Sort by outstanding amount descending
    ledgerGroupsArray.sort((a, b) => b.outstanding - a.outstanding);

    // Calculate summary
    const totalOutstanding = ledgerGroupsArray.reduce((sum, item) => sum + item.outstanding, 0);
    const totalInvoices = ledgerGroupsArray.reduce((sum, item) => sum + item.invoiceCount, 0);

    res.status(200).json({
      success: true,
      message: 'Outstanding data fetched successfully for group user',
      data: {
        LEDGER_GROUPS: ledgerGroupsArray, // Exact field name matching frontend
        BILLS_DATA: billsData, // Exact field name matching frontend
        summary: {
          totalLedgers: ledgerGroupsArray.length,
          totalOutstanding,
          totalInvoices
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching outstanding for group user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding data',
      error: error.message
    });
  }
};

/**
 * @desc    Get outstanding details with complete invoice/voucher information (Combined API)
 * @route   GET /api/v1/tally/outstanding/:outstandingId/details
 * @access  Public (No auth - Tally integration)
 */
export const getOutstandingWithDetails = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const { cmpcode: rawCmpcode, vchguid } = req.query;

    if (!rawCmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const cmpcode = rawCmpcode.trim().toUpperCase();

    // Find company first
    const company = await Company.findOne({ companyCode: cmpcode, isActive: true });
    
    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company not found for cmpcode: ${cmpcode}`
      });
    }

    // Find outstanding entry by ID or vchguid
    let outstanding = null;
    
    if (outstandingId && outstandingId !== 'undefined') {
      outstanding = await Outstanding.findOne({
        _id: outstandingId,
        companyId: company._id,
        isActive: true
      })
        .populate('partyId', 'LedgerName LedgerMobile Email LedgerGUID')
        .populate('companyId', 'companyName companyCode')
        .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname vchguid')
        .lean();
    } else if (vchguid) {
      outstanding = await Outstanding.findOne({
        vchguid: vchguid,
        companyId: company._id,
        isActive: true
      })
        .populate('partyId', 'LedgerName LedgerMobile Email LedgerGUID')
        .populate('companyId', 'companyName companyCode')
        .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname vchguid')
        .lean();
    }

    if (!outstanding) {
      return res.status(404).json({
        success: false,
        message: 'Outstanding entry not found'
      });
    }

    // Get voucher details with all entries
    const voucherGuid = outstanding.vchguid || (outstanding.voucherId?.vchguid);
    
    if (!voucherGuid) {
      return res.status(404).json({
        success: false,
        message: 'Voucher GUID not found for this outstanding entry'
      });
    }

    // Get voucher details
    const voucher = await VoucherMaster.findOne({ 
      vchguid: voucherGuid, 
      cmpcode: cmpcode, 
      isActive: true 
    })
      .populate('ledgerId', 'LedgerName LedgerMobile LedgerAddress1 LedgerGSTIN Email LedgerGUID')
      .populate('companyId', 'companyName companyCode')
      .lean();

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found for this outstanding entry'
      });
    }

    // Get ledger entries for this voucher
    const ledgerEntries = await LedgerEntries.find({ 
      vchguid: voucherGuid, 
      cmpcode: cmpcode, 
      isActive: true 
    })
      .populate('ledgerId', 'LedgerName LedgerMobile Email LedgerGSTIN LedgerGUID')
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .lean();

    // Get inventory entries for this voucher
    const inventoryEntries = await InventoryEntries.find({ 
      vchguid: voucherGuid, 
      cmpcode: cmpcode, 
      isActive: true 
    })
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .lean();

    // Calculate ledger entries summary
    const ledgerTotalAmount = ledgerEntries.reduce((sum, entry) => sum + (entry.ledgeramount || 0), 0);

    // Calculate inventory entries summary
    const inventoryTotalQuantity = inventoryEntries.reduce((sum, entry) => sum + (entry.itemmainqty || 0), 0);
    const inventoryTotalAmount = inventoryEntries.reduce((sum, entry) => sum + (entry.itemamount || 0), 0);

    // Format outstanding entry for response
    const outstandingDetails = {
      _id: outstanding._id,
      outstandingId: outstanding.outstandingId,
      partyId: outstanding.partyId,
      partyName: outstanding.partyName,
      partyType: outstanding.partyType,
      partyContact: outstanding.partyContact,
      totalAmount: outstanding.totalAmount,
      paidAmount: outstanding.paidAmount,
      outstandingAmount: outstanding.outstandingAmount,
      currency: outstanding.currency,
      paymentTerms: outstanding.paymentTerms,
      dueDate: outstanding.dueDate,
      creditLimit: outstanding.creditLimit,
      status: outstanding.status,
      daysOverdue: outstanding.daysOverdue,
      lastPaymentDate: outstanding.lastPaymentDate,
      lastPaymentAmount: outstanding.lastPaymentAmount,
      riskLevel: outstanding.riskLevel,
      riskFactors: outstanding.riskFactors,
      vchguid: outstanding.vchguid,
      vchnumber: outstanding.vchnumber || voucher.vchnumber,
      vchdate: outstanding.vchdate || voucher.vchdate,
      tallyGUID: outstanding.tallyGUID,
      tallySyncStatus: outstanding.tallySyncStatus,
      tallySyncAt: outstanding.tallySyncAt,
      createdAt: outstanding.createdAt,
      updatedAt: outstanding.updatedAt
    };

    res.status(200).json({
      success: true,
      message: 'Outstanding details with invoice information fetched successfully',
      data: {
        outstanding: outstandingDetails,
        voucher: voucher,
        ledgerEntries: {
          entries: ledgerEntries,
          summary: {
            totalEntries: ledgerEntries.length,
            totalAmount: ledgerTotalAmount
          }
        },
        inventoryEntries: {
          entries: inventoryEntries,
          summary: {
            totalEntries: inventoryEntries.length,
            totalQuantity: inventoryTotalQuantity,
            totalAmount: inventoryTotalAmount
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching outstanding with details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding details with invoice information',
      error: error.message
    });
  }
};

