# User Address Migration Script

This script adds address fields to all users in the MongoDB database.

## Address Fields Added

The script adds the following address fields to the User model:
- `address.street` - Street address
- `address.city` - City name
- `address.state` - State name
- `address.pincode` - Postal code
- `address.country` - Country (defaults to "India")

## How to Run

### Option 1: Using npm scripts (Recommended)

```bash
# Update only users without address information
npm run migrate:addresses

# Update ALL users (including those with existing addresses)
npm run migrate:addresses:all
```

### Option 2: Direct node execution

```bash
# Update only users without address information
node scripts/updateUserAddresses.js

# Update ALL users (including those with existing addresses)
node scripts/updateUserAddresses.js --all
```

### Option 3: Using batch files (Windows)

```bash
# Run the migration
run-address-migration.bat
```

### Option 4: Using PowerShell (Windows)

```powershell
# Run the migration
.\run-address-migration.ps1
```

## What the Script Does

1. **Connects to MongoDB** using the connection string from environment variables
2. **Finds users** without proper address information
3. **Assigns random addresses** from a predefined list of Indian cities
4. **Updates the database** with the new address information
5. **Provides detailed logging** of the migration process
6. **Verifies the results** and shows statistics

## Sample Addresses

The script uses a predefined list of sample addresses from major Indian cities:
- Mumbai, Maharashtra
- Delhi, Delhi
- Bangalore, Karnataka
- Chennai, Tamil Nadu
- Kolkata, West Bengal
- Hyderabad, Telangana
- Pune, Maharashtra
- Chandigarh, Chandigarh
- Kochi, Kerala
- Jaipur, Rajasthan

## Safety Features

- **Dry run capability**: The script only updates users that need address information
- **Error handling**: Continues processing even if individual user updates fail
- **Detailed logging**: Shows exactly which users were updated
- **Verification**: Confirms the migration was successful
- **Rollback safe**: Original data is preserved, only new fields are added

## Output Example

```
🔍 Starting user address update process...
📊 Found 150 users without proper address information
✅ Updated user: John Doe (john@example.com) - Mumbai, Maharashtra
✅ Updated user: Jane Smith (jane@example.com) - Delhi, Delhi
...

📈 Update Summary:
✅ Successfully updated: 148 users
❌ Errors: 2 users
📊 Total processed: 150 users

🔍 Verification:
📊 Total users: 200
📊 Users with address: 198
📊 Coverage: 99.00%
```

## Environment Requirements

- Node.js installed
- MongoDB connection string in `.env` file
- All dependencies installed (`npm install`)

## Troubleshooting

If you encounter issues:

1. **Check MongoDB connection**: Ensure the database is running and accessible
2. **Verify environment variables**: Check that `MONGODB_URI` is set correctly
3. **Check permissions**: Ensure the database user has write permissions
4. **Review logs**: The script provides detailed error messages for each failed update

## Notes

- The script is idempotent - running it multiple times is safe
- Users with existing complete address information are skipped
- The script uses random address assignment for demonstration purposes
- In production, you may want to customize the address assignment logic
