Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    User Address Migration Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Starting address migration for users..." -ForegroundColor Yellow
Write-Host ""

# Run the migration script
npm run migrate:addresses

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "    Migration completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Read-Host "Press Enter to continue"
