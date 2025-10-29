@echo off
echo ========================================
echo    User Address Migration Script
echo ========================================
echo.

echo Starting address migration for users...
echo.

REM Run the migration script
npm run migrate:addresses

echo.
echo ========================================
echo    Migration completed!
echo ========================================
pause
