# ============================================================
# WINDOWS APPLICATION MONITOR - VERSION 3
#
# Monitors:
#   1. Windows CPU
#   2. Windows Memory
#   3. Windows C: Disk
#   4. Angular /welcome
#   5. Backend TCP port 8080
#   6. Response time
#   7. Alerts
#   8. CSV monitoring history
#
# IMPORTANT:
# /api/auth/login is NOT called because it is a login API.
# Backend availability is checked using TCP port 8080.
# ============================================================


# ============================================================
# 1. CONFIGURATION
# ============================================================

$AngularUrl = "http://192.168.29.216:8200/welcome"

$BackendHost = "192.168.29.216"

$BackendPort = 8080

# ============================================================
# POSTGRESQL DATABASE CONFIGURATION
# ============================================================

$DBHost = "192.168.29.98"
$DBPort = 5432
$DBName = "wildplant"
$DBUser = "postgres"
$DBPass = "postgres"



# Check every 5 seconds
$CheckIntervalSeconds = 5


# ============================================================
# CPU THRESHOLDS
# ============================================================

$CpuWarningThreshold  = 80
$CpuCriticalThreshold = 90


# ============================================================
# MEMORY THRESHOLDS
# ============================================================

$MemoryWarningThreshold  = 80
$MemoryCriticalThreshold = 90


# ============================================================
# DISK THRESHOLDS
# ============================================================

$DiskWarningThreshold  = 80
$DiskCriticalThreshold = 90


# ============================================================
# ANGULAR RESPONSE TIME THRESHOLDS
# ============================================================

$AngularResponseWarning  = 500
$AngularResponseCritical = 1000


# ============================================================
# NUMBER OF CONSECUTIVE BAD READINGS REQUIRED FOR ALERT
# ============================================================

$RequiredHighSamples = 3


# ============================================================
# DISK TO MONITOR
# ============================================================

$DriveLetter = "C:"


# ============================================================
# 2. OUTPUT DIRECTORY
# ============================================================

$OutputDirectory = Join-Path `
    $PSScriptRoot `
    "monitor_output"


if (-not (Test-Path $OutputDirectory)) {

    New-Item `
        -Path $OutputDirectory `
        -ItemType Directory `
        -Force | Out-Null
}


$MetricsFile = Join-Path `
    $OutputDirectory `
    "application_metrics.csv"


$AlertFile = Join-Path `
    $OutputDirectory `
    "alerts.log"

# ============================================================
# HEALTH CHECKER JSON
#
# Angular/Node.js reads this file through the backend API.
# ============================================================

$HealthFile = Join-Path `
    $OutputDirectory `
    "health.json"


# ============================================================
# 3. CREATE CSV HEADER
# ============================================================

if (-not (Test-Path $MetricsFile)) {

    $Header = @"
Timestamp,CPU_Percent,Memory_Percent,Disk_Percent,Angular_Status,Angular_Response_ms,Backend_Host,Backend_Port,Backend_Status,Overall_Status
"@

    Set-Content `
        -Path $MetricsFile `
        -Value $Header `
        -Encoding UTF8
}


# ============================================================
# 4. ALERT COUNTERS
# ============================================================

$CpuHighCount = 0

$MemoryHighCount = 0

$DiskHighCount = 0

$AngularSlowCount = 0

$BackendDownCount = 0


# ============================================================
# 5. ALERT STATES
#
# Prevents popup every 5 seconds.
# ============================================================

$CpuAlertActive = $false

$MemoryAlertActive = $false

$DiskAlertActive = $false

$AngularSlowAlertActive = $false

$BackendDownAlertActive = $false


# ============================================================
# 6. POPUP FUNCTION
# ============================================================

function Show-AlertPopup {

    param (
        [string]$Title,
        [string]$Message
    )


    try {

        Add-Type `
            -AssemblyName PresentationFramework `
            -ErrorAction SilentlyContinue


        [System.Windows.MessageBox]::Show(
            $Message,
            $Title,
            [System.Windows.MessageBoxButton]::OK,
            [System.Windows.MessageBoxImage]::Warning
        ) | Out-Null

    }
    catch {

        Write-Host ""

        Write-Host "POPUP ALERT" `
            -ForegroundColor Yellow

        Write-Host $Message `
            -ForegroundColor Yellow

        Write-Host ""
    }
}


# ============================================================
# 7. ALERT LOG FUNCTION
# ============================================================

function Write-AlertLog {

    param (
        [string]$AlertType,

        [string]$Message
    )


    $Timestamp =
        Get-Date -Format "yyyy-MM-dd HH:mm:ss"


    $LogMessage =
        "$Timestamp | $AlertType | $Message"


    Add-Content `
        -Path $AlertFile `
        -Value $LogMessage `
        -Encoding UTF8


    Write-Host ""

    Write-Host "============================================================" `
        -ForegroundColor Red

    Write-Host "ALERT" `
        -ForegroundColor Red

    Write-Host $LogMessage `
        -ForegroundColor Red

    Write-Host "============================================================" `
        -ForegroundColor Red

    Write-Host ""
}


# ============================================================
# 8. CPU FUNCTION
# ============================================================

function Get-CPUUsage {

    try {

        $Counter = Get-Counter `
            '\Processor(_Total)\% Processor Time' `
            -ErrorAction Stop


        $CPU =
            $Counter.CounterSamples[0].CookedValue


        return [math]::Round(
            $CPU,
            2
        )
    }
    catch {

        return -1
    }
}


# ============================================================
# 9. MEMORY FUNCTION
# ============================================================

function Get-MemoryUsage {

    try {

        $OS = Get-CimInstance `
            Win32_OperatingSystem `
            -ErrorAction Stop


        $TotalMemoryKB =
            $OS.TotalVisibleMemorySize


        $FreeMemoryKB =
            $OS.FreePhysicalMemory


        $UsedMemoryKB =
            $TotalMemoryKB - $FreeMemoryKB


        $MemoryPercentage =
            ($UsedMemoryKB / $TotalMemoryKB) * 100


        return [math]::Round(
            $MemoryPercentage,
            2
        )
    }
    catch {

        return -1
    }
}


# ============================================================
# 10. DISK FUNCTION
# ============================================================

function Get-DiskUsage {

    param (
        [string]$Drive
    )


    try {

        $Disk = Get-CimInstance `
            Win32_LogicalDisk `
            -Filter "DeviceID='$Drive'" `
            -ErrorAction Stop


        if ($null -eq $Disk) {

            return -1
        }


        if ($Disk.Size -eq 0) {

            return -1
        }


        $UsedSpace =
            $Disk.Size - $Disk.FreeSpace


        $Usage =
            ($UsedSpace / $Disk.Size) * 100


        return [math]::Round(
            $Usage,
            2
        )
    }
    catch {

        return -1
    }
}


# ============================================================
# 11. ANGULAR WEB REQUEST
# ============================================================

function Test-AngularApplication {

    param (
        [string]$Url
    )


    $Result = [PSCustomObject]@{

        Success      = $false

        StatusCode   = 0

        ResponseTime = -1

        ErrorMessage = ""
    }


    $Stopwatch =
        [System.Diagnostics.Stopwatch]::StartNew()


    try {

        $Response = Invoke-WebRequest `
            -Uri $Url `
            -Method GET `
            -TimeoutSec 30 `
            -UseBasicParsing `
            -ErrorAction Stop


        $Stopwatch.Stop()


        $Result.Success = $true


        $Result.StatusCode =
            [int]$Response.StatusCode


        $Result.ResponseTime =
            [math]::Round(
                $Stopwatch.Elapsed.TotalMilliseconds,
                2
            )
    }
    catch {

        $Stopwatch.Stop()


        $Result.Success = $false


        $Result.ResponseTime =
            [math]::Round(
                $Stopwatch.Elapsed.TotalMilliseconds,
                2
            )


        $Result.ErrorMessage =
            $_.Exception.Message
    }


    return $Result
}


# ============================================================
# 12. BACKEND TCP TEST
#
# We do NOT call /api/auth/login.
#
# We only check whether port 8080 is reachable.
# ============================================================

function Test-Backend {

    param (

        [string]$HostName,

        [int]$Port
    )


    $Result = [PSCustomObject]@{

        Success      = $false

        ResponseTime = -1

        ErrorMessage = ""
    }


    $Stopwatch =
        [System.Diagnostics.Stopwatch]::StartNew()


    try {

        $Test = Test-NetConnection `
            -ComputerName $HostName `
            -Port $Port `
            -InformationLevel Quiet `
            -WarningAction SilentlyContinue


        $Stopwatch.Stop()


        $Result.Success =
            [bool]$Test


        $Result.ResponseTime =
            [math]::Round(
                $Stopwatch.Elapsed.TotalMilliseconds,
                2
            )


        if (-not $Test) {

            $Result.ErrorMessage =
                "TCP connection to port $Port failed"
        }
    }
    catch {

        $Stopwatch.Stop()


        $Result.Success = $false


        $Result.ResponseTime =
            [math]::Round(
                $Stopwatch.Elapsed.TotalMilliseconds,
                2
            )


        $Result.ErrorMessage =
            $_.Exception.Message
    }


    return $Result
}


# ============================================================
# HEALTH JSON FUNCTION
#
# Writes the latest monitoring result in a structured format
# for the Node.js Health Checker API.
# ============================================================

# ============================================================
# POSTGRESQL DATABASE TEST
#
# If psql.exe is installed, performs a real PostgreSQL
# authentication + SELECT 1 check.
# Otherwise, falls back to checking TCP port 5432.
# ============================================================

function Test-Database {

    $Result = [PSCustomObject]@{
        Success      = $false
        ResponseTime = -1
        ErrorMessage = ""
        CheckType    = "TCP"
    }

    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {

        $PsqlCommand = Get-Command psql.exe -ErrorAction SilentlyContinue

        if ($null -ne $PsqlCommand) {

            $OldPgPassword = $env:PGPASSWORD
            $env:PGPASSWORD = $DBPass

            try {

                $Output = & $PsqlCommand.Source `
                    -h $DBHost `
                    -p $DBPort `
                    -U $DBUser `
                    -d $DBName `
                    -w `
                    -tA `
                    -c "SELECT 1;" 2>&1

                $ExitCode = $LASTEXITCODE
                $Stopwatch.Stop()

                if ($ExitCode -eq 0 -and (($Output -join "").Trim() -eq "1")) {
                    $Result.Success = $true
                    $Result.ResponseTime =
                        [math]::Round($Stopwatch.Elapsed.TotalMilliseconds, 2)
                    $Result.CheckType = "POSTGRESQL"
                }
                else {
                    $Result.Success = $false
                    $Result.ResponseTime =
                        [math]::Round($Stopwatch.Elapsed.TotalMilliseconds, 2)
                    $Result.CheckType = "POSTGRESQL"
                    $Result.ErrorMessage = (($Output -join " ").Trim())

                    if ([string]::IsNullOrWhiteSpace($Result.ErrorMessage)) {
                        $Result.ErrorMessage =
                            "PostgreSQL connection failed. psql exit code: $ExitCode"
                    }
                }
            }
            finally {
                if ($null -eq $OldPgPassword) {
                    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
                }
                else {
                    $env:PGPASSWORD = $OldPgPassword
                }
            }
        }
        else {

            $Test = Test-NetConnection `
                -ComputerName $DBHost `
                -Port $DBPort `
                -InformationLevel Quiet `
                -WarningAction SilentlyContinue

            $Stopwatch.Stop()

            $Result.Success = [bool]$Test
            $Result.ResponseTime =
                [math]::Round($Stopwatch.Elapsed.TotalMilliseconds, 2)
            $Result.CheckType = "TCP"

            if (-not $Result.Success) {
                $Result.ErrorMessage =
                    "PostgreSQL port $DBPort is not reachable."
            }
            else {
                $Result.ErrorMessage =
                    "psql.exe not found. TCP port check passed; database authentication was not tested."
            }
        }
    }
    catch {
        $Stopwatch.Stop()
        $Result.Success = $false
        $Result.ResponseTime =
            [math]::Round($Stopwatch.Elapsed.TotalMilliseconds, 2)
        $Result.ErrorMessage = $_.Exception.Message
    }

    return $Result
}


function Write-HealthJson {

    param (
        [string]$Timestamp,
        [double]$CPU,
        [double]$Memory,
        [double]$Disk,
        $Angular,
        $Backend,
        $Database,
        [string]$OverallStatus
    )

    try {

        # Convert the existing console status names into
        # dashboard-friendly status names.
        $CpuStatus = "NORMAL"
        if ($CPU -ge $CpuCriticalThreshold) {
            $CpuStatus = "CRITICAL"
        }
        elseif ($CPU -ge $CpuWarningThreshold) {
            $CpuStatus = "WARNING"
        }

        $MemoryStatus = "NORMAL"
        if ($Memory -ge $MemoryCriticalThreshold) {
            $MemoryStatus = "CRITICAL"
        }
        elseif ($Memory -ge $MemoryWarningThreshold) {
            $MemoryStatus = "WARNING"
        }

        $DiskStatus = "NORMAL"
        if ($Disk -ge $DiskCriticalThreshold) {
            $DiskStatus = "CRITICAL"
        }
        elseif ($Disk -ge $DiskWarningThreshold) {
            $DiskStatus = "WARNING"
        }

        $AngularStatus = "DOWN"
        if ($Angular.Success) {
            if ($Angular.ResponseTime -ge $AngularResponseCritical) {
                $AngularStatus = "CRITICAL"
            }
            elseif ($Angular.ResponseTime -ge $AngularResponseWarning) {
                $AngularStatus = "WARNING"
            }
            else {
                $AngularStatus = "UP"
            }
        }

        $BackendStatus = "DOWN"
        if ($Backend.Success) {
            $BackendStatus = "UP"
        }

        $DatabaseStatus = "DOWN"
        if ($Database.Success) {
            $DatabaseStatus = "UP"
        }

        # Count currently active warning/critical conditions.
        $Warnings = @()
        $CriticalAlerts = @()

        if ($CPU -ge $CpuCriticalThreshold) {
            $CriticalAlerts += "CPU usage is $CPU%"
        }
        elseif ($CPU -ge $CpuWarningThreshold) {
            $Warnings += "CPU usage is $CPU%"
        }

        if ($Memory -ge $MemoryCriticalThreshold) {
            $CriticalAlerts += "Memory usage is $Memory%"
        }
        elseif ($Memory -ge $MemoryWarningThreshold) {
            $Warnings += "Memory usage is $Memory%"
        }

        if ($Disk -ge $DiskCriticalThreshold) {
            $CriticalAlerts += "Disk usage is $Disk%"
        }
        elseif ($Disk -ge $DiskWarningThreshold) {
            $Warnings += "Disk usage is $Disk%"
        }

        if (-not $Angular.Success) {
            $CriticalAlerts += "Angular application is DOWN"
        }
        elseif ($Angular.ResponseTime -ge $AngularResponseCritical) {
            $CriticalAlerts += "Angular response time is $($Angular.ResponseTime) ms"
        }
        elseif ($Angular.ResponseTime -ge $AngularResponseWarning) {
            $Warnings += "Angular response time is $($Angular.ResponseTime) ms"
        }

        if (-not $Backend.Success) {
            $CriticalAlerts += "Backend port $BackendPort is DOWN"
        }

        if (-not $Database.Success) {
            $CriticalAlerts += "PostgreSQL database $DBName is DOWN"
        }

        # Dashboard status is HEALTHY/WARNING/CRITICAL.
        $DashboardOverallStatus = "HEALTHY"

        if ($CriticalAlerts.Count -gt 0) {
            $DashboardOverallStatus = "CRITICAL"
        }
        elseif ($Warnings.Count -gt 0) {
            $DashboardOverallStatus = "WARNING"
        }

        $HealthData = [PSCustomObject]@{
            timestamp = $Timestamp

            computer = $env:COMPUTERNAME

            overallStatus = $DashboardOverallStatus

            system = [PSCustomObject]@{
                cpu = [PSCustomObject]@{
                    usage = $CPU
                    status = $CpuStatus
                }

                memory = [PSCustomObject]@{
                    usage = $Memory
                    status = $MemoryStatus
                }

                disk = [PSCustomObject]@{
                    drive = $DriveLetter
                    usage = $Disk
                    status = $DiskStatus
                }
            }

            services = [PSCustomObject]@{
                angular = [PSCustomObject]@{
                    status = $AngularStatus
                    httpStatus = $Angular.StatusCode
                    responseTime = $Angular.ResponseTime
                    url = $AngularUrl
                    error = $Angular.ErrorMessage
                }

                backend = [PSCustomObject]@{
                    status = $BackendStatus
                    port = $BackendPort
                    responseTime = $Backend.ResponseTime
                    host = $BackendHost
                    error = $Backend.ErrorMessage
                }

                database = [PSCustomObject]@{
                    status = $DatabaseStatus
                    host = $DBHost
                    port = $DBPort
                    name = $DBName
                    user = $DBUser
                    responseTime = $Database.ResponseTime
                    checkType = $Database.CheckType
                    error = $Database.ErrorMessage
                }
            }

            alerts = [PSCustomObject]@{
                warnings = @($Warnings)
                critical = @($CriticalAlerts)
            }
        }

        $Json = $HealthData |
            ConvertTo-Json -Depth 8

        # Write atomically so Node.js does not normally read
        # a partially written JSON file.
        $TempHealthFile = "$HealthFile.tmp"

        Set-Content `
            -Path $TempHealthFile `
            -Value $Json `
            -Encoding UTF8

        Move-Item `
            -Path $TempHealthFile `
            -Destination $HealthFile `
            -Force
    }
    catch {

        Write-Host `
            "Could not write health.json: $($_.Exception.Message)" `
            -ForegroundColor Red
    }
}


# ============================================================
# 13. START MONITOR
# ============================================================

Clear-Host


Write-Host "============================================================"

Write-Host "             WINDOWS APPLICATION MONITOR"

Write-Host "============================================================"


Write-Host ""

Write-Host "Computer        : $env:COMPUTERNAME"

Write-Host "Angular URL     : $AngularUrl"

Write-Host "Backend Host    : $BackendHost"

Write-Host "Backend Port    : $BackendPort"

Write-Host ""

Write-Host "Check Interval  : $CheckIntervalSeconds seconds"

Write-Host ""

Write-Host "CPU Warning     : $CpuWarningThreshold %"

Write-Host "CPU Critical    : $CpuCriticalThreshold %"

Write-Host ""

Write-Host "Memory Warning  : $MemoryWarningThreshold %"

Write-Host "Memory Critical : $MemoryCriticalThreshold %"

Write-Host ""

Write-Host "Disk Warning    : $DiskWarningThreshold %"

Write-Host "Disk Critical   : $DiskCriticalThreshold %"

Write-Host ""

Write-Host "Angular Warning : $AngularResponseWarning ms"

Write-Host "Angular Critical: $AngularResponseCritical ms"

Write-Host ""

Write-Host "============================================================"


# ============================================================
# 14. MAIN MONITORING LOOP
# ============================================================

while ($true) {


    # ========================================================
    # TIMESTAMP
    # ========================================================

    $Timestamp =
        Get-Date -Format "yyyy-MM-dd HH:mm:ss"


    # ========================================================
    # SERVER METRICS
    # ========================================================

    $CPU =
        Get-CPUUsage


    $Memory =
        Get-MemoryUsage


    $Disk =
        Get-DiskUsage `
            -Drive $DriveLetter


    # ========================================================
    # ANGULAR
    # ========================================================

    $Angular =
        Test-AngularApplication `
            -Url $AngularUrl


    # ========================================================
    # BACKEND
    # ========================================================

    $Backend =
        Test-Backend `
            -HostName $BackendHost `
            -Port $BackendPort


    # ========================================================
    # POSTGRESQL DATABASE
    # ========================================================

    $Database =
        Test-Database


    # ========================================================
    # DEFAULT STATUS
    # ========================================================

    $OverallStatus = "NORMAL"


    # ========================================================
    # CPU
    # ========================================================

    if ($CPU -ge $CpuWarningThreshold) {

        $CpuHighCount++
    }
    else {

        $CpuHighCount = 0


        if ($CpuAlertActive) {

            Write-Host `
                "CPU returned to normal." `
                -ForegroundColor Green

            $CpuAlertActive = $false
        }
    }


    if ($CPU -ge $CpuCriticalThreshold) {

        $OverallStatus = "CRITICAL"
    }
    elseif ($CPU -ge $CpuWarningThreshold) {

        if ($OverallStatus -eq "NORMAL") {

            $OverallStatus = "HIGH"
        }
    }


    # ========================================================
    # CPU ALERT
    # ========================================================

    if (
        ($CpuHighCount -ge $RequiredHighSamples) -and
        (-not $CpuAlertActive)
    ) {


        $Message = @"
CPU PERFORMANCE IS HIGH

CPU Usage : $CPU %
Server    : $env:COMPUTERNAME
Time      : $Timestamp
"@


        Write-AlertLog `
            -AlertType "CPU HIGH" `
            -Message "CPU Usage=$CPU%"


        Show-AlertPopup `
            -Title "CPU PERFORMANCE HIGH" `
            -Message $Message


        $CpuAlertActive = $true
    }


    # ========================================================
    # MEMORY
    # ========================================================

    if ($Memory -ge $MemoryWarningThreshold) {

        $MemoryHighCount++
    }
    else {

        $MemoryHighCount = 0


        if ($MemoryAlertActive) {

            Write-Host `
                "Memory returned to normal." `
                -ForegroundColor Green

            $MemoryAlertActive = $false
        }
    }


    if ($Memory -ge $MemoryCriticalThreshold) {

        $OverallStatus = "CRITICAL"
    }
    elseif ($Memory -ge $MemoryWarningThreshold) {

        if ($OverallStatus -eq "NORMAL") {

            $OverallStatus = "HIGH"
        }
    }


    # ========================================================
    # MEMORY ALERT
    # ========================================================

    if (
        ($MemoryHighCount -ge $RequiredHighSamples) -and
        (-not $MemoryAlertActive)
    ) {


        $Message = @"
MEMORY USAGE IS HIGH

Memory Usage : $Memory %
Server       : $env:COMPUTERNAME
Time         : $Timestamp
"@


        Write-AlertLog `
            -AlertType "MEMORY HIGH" `
            -Message "Memory Usage=$Memory%"


        Show-AlertPopup `
            -Title "MEMORY USAGE HIGH" `
            -Message $Message


        $MemoryAlertActive = $true
    }


    # ========================================================
    # DISK
    # ========================================================

    if ($Disk -ge $DiskCriticalThreshold) {

        $OverallStatus = "CRITICAL"
    }
    elseif ($Disk -ge $DiskWarningThreshold) {

        if ($OverallStatus -eq "NORMAL") {

            $OverallStatus = "HIGH"
        }
    }


    if ($Disk -ge $DiskWarningThreshold) {

        $DiskHighCount++
    }
    else {

        $DiskHighCount = 0


        if ($DiskAlertActive) {

            Write-Host `
                "Disk usage returned to normal." `
                -ForegroundColor Green

            $DiskAlertActive = $false
        }
    }


    # ========================================================
    # DISK ALERT
    # ========================================================

    if (
        ($DiskHighCount -ge $RequiredHighSamples) -and
        (-not $DiskAlertActive)
    ) {


        $Message = @"
DISK USAGE IS HIGH

Drive : $DriveLetter
Usage : $Disk %
Time  : $Timestamp
"@


        Write-AlertLog `
            -AlertType "DISK HIGH" `
            -Message "Drive=$DriveLetter Usage=$Disk%"


        Show-AlertPopup `
            -Title "DISK USAGE HIGH" `
            -Message $Message


        $DiskAlertActive = $true
    }


    # ========================================================
    # ANGULAR DOWN
    # ========================================================

    if (-not $Angular.Success) {

        $OverallStatus = "DOWN"

    }


    # ========================================================
    # ANGULAR RESPONSE TIME
    # ========================================================

    if ($Angular.Success) {


        if (
            $Angular.ResponseTime `
            -ge $AngularResponseWarning
        ) {

            $AngularSlowCount++
        }
        else {

            $AngularSlowCount = 0


            if ($AngularSlowAlertActive) {

                Write-Host `
                    "Angular response returned to normal." `
                    -ForegroundColor Green

                $AngularSlowAlertActive = $false
            }
        }


        if (
            $Angular.ResponseTime `
            -ge $AngularResponseCritical
        ) {

            $OverallStatus = "CRITICAL"
        }
        elseif (
            $Angular.ResponseTime `
            -ge $AngularResponseWarning
        ) {

            if ($OverallStatus -eq "NORMAL") {

                $OverallStatus = "SLOW"
            }
        }
    }


    # ========================================================
    # ANGULAR SLOW ALERT
    # ========================================================

    if (
        ($AngularSlowCount -ge $RequiredHighSamples) -and
        (-not $AngularSlowAlertActive)
    ) {


        $Message = @"
ANGULAR RESPONSE IS SLOW

URL           : $AngularUrl
HTTP Status   : $($Angular.StatusCode)
Response Time : $($Angular.ResponseTime) ms
Time          : $Timestamp
"@


        Write-AlertLog `
            -AlertType "ANGULAR SLOW" `
            -Message "ResponseTime=$($Angular.ResponseTime) ms"


        Show-AlertPopup `
            -Title "ANGULAR RESPONSE SLOW" `
            -Message $Message


        $AngularSlowAlertActive = $true
    }


    # ========================================================
    # BACKEND DOWN
    # ========================================================

    if (-not $Backend.Success) {

        $BackendDownCount++


        $OverallStatus = "DOWN"
    }
    else {

        $BackendDownCount = 0


        if ($BackendDownAlertActive) {

            Write-AlertLog `
                -AlertType "BACKEND RECOVERED" `
                -Message "Host=$BackendHost Port=$BackendPort"


            Write-Host `
                "Backend recovered." `
                -ForegroundColor Green


            $BackendDownAlertActive = $false
        }
    }


    # ========================================================
    # BACKEND DOWN ALERT
    # ========================================================

    if (
        ($BackendDownCount -ge $RequiredHighSamples) -and
        (-not $BackendDownAlertActive)
    ) {


        $Message = @"
BACKEND APPLICATION IS DOWN

Backend Host : $BackendHost
Backend Port : $BackendPort
Time         : $Timestamp

The monitoring system could not establish
a TCP connection to the backend.
"@


        Write-AlertLog `
            -AlertType "BACKEND DOWN" `
            -Message "Host=$BackendHost Port=$BackendPort"


        Show-AlertPopup `
            -Title "BACKEND APPLICATION DOWN" `
            -Message $Message


        $BackendDownAlertActive = $true
    }


    # ========================================================
    # DATABASE STATUS
    # ========================================================

    if (-not $Database.Success) {

        if ($OverallStatus -ne "CRITICAL") {
            $OverallStatus = "DOWN"
        }

        Add-Content `
            -Path $AlertFile `
            -Value "$Timestamp - CRITICAL - PostgreSQL database $DBName is DOWN. $($Database.ErrorMessage)" `
            -Encoding UTF8
    }


    # ========================================================
    # SAVE CSV
    # ========================================================

    $CsvLine = @(
        $Timestamp

        $CPU

        $Memory

        $Disk

        $Angular.StatusCode

        $Angular.ResponseTime

        $BackendHost

        $BackendPort

        $(if ($Backend.Success) { "UP" } else { "DOWN" })

        $OverallStatus

    ) -join ","


    Add-Content `
        -Path $MetricsFile `
        -Value $CsvLine `
        -Encoding UTF8


    # ========================================================
    # SAVE HEALTH JSON FOR WEB HEALTH CHECKER
    # ========================================================

    Write-HealthJson `
        -Timestamp $Timestamp `
        -CPU $CPU `
        -Memory $Memory `
        -Disk $Disk `
        -Angular $Angular `
        -Backend $Backend `
        -Database $Database `
        -OverallStatus $OverallStatus


    # ========================================================
    # DISPLAY
    # ========================================================

    Clear-Host


    Write-Host "============================================================"

    Write-Host "             WINDOWS APPLICATION MONITOR"

    Write-Host "============================================================"


    Write-Host ""

    Write-Host "Timestamp       : $Timestamp"

    Write-Host "Computer        : $env:COMPUTERNAME"


    # ========================================================
    # SERVER
    # ========================================================

    Write-Host ""

    Write-Host "---------------- SERVER PERFORMANCE ------------------------"


    if ($CPU -ge $CpuCriticalThreshold) {

        Write-Host `
            ("CPU Usage       : {0} %" -f $CPU) `
            -ForegroundColor Red

    }
    elseif ($CPU -ge $CpuWarningThreshold) {

        Write-Host `
            ("CPU Usage       : {0} %" -f $CPU) `
            -ForegroundColor Yellow

    }
    else {

        Write-Host `
            ("CPU Usage       : {0} %" -f $CPU) `
            -ForegroundColor Green
    }


    if ($Memory -ge $MemoryCriticalThreshold) {

        Write-Host `
            ("Memory Usage    : {0} %" -f $Memory) `
            -ForegroundColor Red

    }
    elseif ($Memory -ge $MemoryWarningThreshold) {

        Write-Host `
            ("Memory Usage    : {0} %" -f $Memory) `
            -ForegroundColor Yellow

    }
    else {

        Write-Host `
            ("Memory Usage    : {0} %" -f $Memory) `
            -ForegroundColor Green
    }


    if ($Disk -ge $DiskCriticalThreshold) {

        Write-Host `
            ("Disk Usage      : {0} %" -f $Disk) `
            -ForegroundColor Red

    }
    elseif ($Disk -ge $DiskWarningThreshold) {

        Write-Host `
            ("Disk Usage      : {0} %" -f $Disk) `
            -ForegroundColor Yellow

    }
    else {

        Write-Host `
            ("Disk Usage      : {0} %" -f $Disk) `
            -ForegroundColor Green
    }


    # ========================================================
    # ANGULAR
    # ========================================================

    Write-Host ""

    Write-Host "---------------- ANGULAR APPLICATION ----------------------"

    Write-Host "URL             : $AngularUrl"


    if ($Angular.Success) {

        Write-Host `
            ("HTTP Status     : {0}" -f $Angular.StatusCode) `
            -ForegroundColor Green


        if (
            $Angular.ResponseTime `
            -ge $AngularResponseCritical
        ) {

            Write-Host `
                ("Response Time   : {0} ms" -f $Angular.ResponseTime) `
                -ForegroundColor Red

        }
        elseif (
            $Angular.ResponseTime `
            -ge $AngularResponseWarning
        ) {

            Write-Host `
                ("Response Time   : {0} ms" -f $Angular.ResponseTime) `
                -ForegroundColor Yellow

        }
        else {

            Write-Host `
                ("Response Time   : {0} ms" -f $Angular.ResponseTime) `
                -ForegroundColor Green
        }

    }
    else {

        Write-Host `
            "Status          : DOWN" `
            -ForegroundColor Red


        Write-Host `
            "Error           : $($Angular.ErrorMessage)" `
            -ForegroundColor Red
    }


    # ========================================================
    # BACKEND
    # ========================================================

    Write-Host ""

    Write-Host "---------------- BACKEND APPLICATION ----------------------"

    Write-Host "Host            : $BackendHost"

    Write-Host "Port            : $BackendPort"


    if ($Backend.Success) {

        Write-Host `
            "Status          : UP" `
            -ForegroundColor Green


        Write-Host `
            ("TCP Response   : {0} ms" -f $Backend.ResponseTime) `
            -ForegroundColor Green
    }
    else {

        Write-Host `
            "Status          : DOWN" `
            -ForegroundColor Red


        Write-Host `
            "Reason          : $($Backend.ErrorMessage)" `
            -ForegroundColor Red
    }


    # ========================================================
    # OVERALL STATUS
    # ========================================================

    Write-Host ""

    Write-Host "---------------- OVERALL STATUS ----------------------------"


    switch ($OverallStatus) {

        "NORMAL" {

            Write-Host `
                "Overall Status  : NORMAL" `
                -ForegroundColor Green
        }

        "HIGH" {

            Write-Host `
                "Overall Status  : HIGH" `
                -ForegroundColor Yellow
        }

        "SLOW" {

            Write-Host `
                "Overall Status  : SLOW" `
                -ForegroundColor Yellow
        }

        "CRITICAL" {

            Write-Host `
                "Overall Status  : CRITICAL" `
                -ForegroundColor Red
        }

        "DOWN" {

            Write-Host `
                "Overall Status  : DOWN" `
                -ForegroundColor Red
        }
    }


    # ========================================================
    # FILES
    # ========================================================

    Write-Host ""

    Write-Host "---------------- MONITORING FILES --------------------------"

    Write-Host "Metrics : $MetricsFile"

    Write-Host "Alerts  : $AlertFile"


    Write-Host ""

    Write-Host "Checking again in $CheckIntervalSeconds seconds..."

    Write-Host "Press CTRL+C to stop."


    # ========================================================
    # WAIT
    # ========================================================

    Start-Sleep `
        -Seconds $CheckIntervalSeconds
}
```

