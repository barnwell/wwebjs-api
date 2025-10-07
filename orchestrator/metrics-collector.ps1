while ($true) {
    try {
        $instances = Invoke-RestMethod -Uri "http://localhost:5000/api/instances" -Method GET
        $runningInstances = $instances | Where-Object { $_.status -eq "running" }
        
        foreach ($instance in $runningInstances) {
            try {
                Invoke-RestMethod -Uri "http://localhost:5000/api/metrics/collect/$($instance.id)" -Method POST | Out-Null
                Write-Host "Collected metrics for $($instance.name)"
            } catch {
                Write-Host "Failed to collect metrics for $($instance.name): $($_.Exception.Message)"
            }
        }
        
        Start-Sleep -Seconds 5
    } catch {
        Write-Host "Error in metrics collection loop: $($_.Exception.Message)"
        Start-Sleep -Seconds 10
    }
}
