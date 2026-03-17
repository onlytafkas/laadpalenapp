# Kill any process using port 3000
Write-Host "Checking for processes using port 3000..." -ForegroundColor Yellow

try {
    $connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    
    if ($connections) {
        foreach ($conn in $connections) {
            try {
                Write-Host "Killing process $($conn.OwningProcess) using port 3000..." -ForegroundColor Cyan
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
                Write-Host "Successfully killed process $($conn.OwningProcess)" -ForegroundColor Green
            } catch {
                Write-Host "Could not kill process $($conn.OwningProcess) (might not exist anymore)" -ForegroundColor DarkGray
            }
        }
        Start-Sleep -Seconds 1
    } else {
        Write-Host "Port 3000 is free" -ForegroundColor Green
    }
} catch {
    Write-Host "Port 3000 is free" -ForegroundColor Green
}

# Clean up .next directory
Write-Host "Cleaning .next directory..." -ForegroundColor Yellow
Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Cleanup complete!" -ForegroundColor Green

# Start dev server
Write-Host "Starting development server..." -ForegroundColor Cyan
npm run dev
