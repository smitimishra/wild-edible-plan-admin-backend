# ============================================================

# WINDOWS APPLICATION MONITOR - VERSION 4

# Database check uses TCP port only

# No psql.exe / PostgreSQL authentication required

# ============================================================
 
# =========================

# CONFIGURATION

# =========================
 
$AngularUrl = "http://192.168.29.98:8200/welcome"
 
$BackendHost = "192.168.29.98"

$BackendPort = 8080
 
# PostgreSQL server

$DBHost = "192.168.29.98"

$DBPort = 5432

$DBName = "wildplant"
 
# Monitoring interval

$CheckIntervalSeconds = 5
 
# Thresholds

$CPUWarning = 80

$CPUCritical = 90
 
$MemoryWarning = 80

$MemoryCritical = 90
 
$DiskWarning = 80

$DiskCritical = 90
 
$AngularWarning = 500

$AngularCritical = 1000
 
# Number of consecutive high samples

$RequiredHighSamples = 3
 
# Disk drive

$Drive = "C:"
 
# =========================

# OUTPUT DIRECTORY

# =========================
 
$OutputDirectory = Join-Path $PSScriptRoot "monitor_output"
 
if (-not (Test-Path $OutputDirectory)) {

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

}
 
$CsvFile = Join-Path $OutputDirectory "application_metrics.csv"

$AlertFile = Join-Path $OutputDirectory "alerts.log"

$HealthFile = Join-Path $OutputDirectory "health.json"
 
# =========================

# CSV HEADER

# =========================
 
if (-not (Test-Path $CsvFile)) {
 
    $Header = @(

        "Timestamp",

        "CPU_Percent",

        "Memory_Percent",

        "Disk_Percent",

        "Angular_Status",

        "Angular_Response_ms",

        "Backend_Host",

        "Backend_Port",

        "Backend_Status",

        "Database_Host",

        "Database_Port",

        "Database_Status",

        "Database_Response_ms",

        "Overall_Status"

    ) -join ","
 
    Set-Content `

        -Path $CsvFile `

        -Value $Header `

        -Encoding UTF8

}
 
# =========================

# HIGH SAMPLE COUNTERS

# =========================
 
$CPUHighSamples = 0

$MemoryHighSamples = 0

$DiskHighSamples = 0

$AngularHighSamples = 0
 
# =========================

# POPUP FUNCTION

# =========================
 
function Show-AlertPopup {

    param(

        [string]$Title,

        [string]$Message

    )
 
    try {

        Add-Type -AssemblyName PresentationFramework
 
        [System.Windows.MessageBox]::Show(

            $Message,

            $Title,

            [System.Windows.MessageBoxButton]::OK,

            [System.Windows.MessageBoxImage]::Warning

        ) | Out-Null

    }

    catch {

        Write-Host "Popup failed: $($_.Exception.Message)"

    }

}
 
# =========================

# CPU CHECK

# =========================
 
function Get-CPUUsage {
 
    try {
 
        $CPU = Get-Counter '\Processor(_Total)\% Processor Time'
 
        $Value = $CPU.CounterSamples[0].CookedValue
 
        return [math]::Round($Value, 2)
 
    }

    catch {
 
        return -1

    }

}
 
# =========================

# MEMORY CHECK

# =========================
 
function Get-MemoryUsage {
 
    try {
 
        $OS = Get-CimInstance Win32_OperatingSystem
 
        $TotalMemory = $OS.TotalVisibleMemorySize

        $FreeMemory = $OS.FreePhysicalMemory
 
        if ($TotalMemory -le 0) {

            return -1

        }
 
        $UsedMemory = $TotalMemory - $FreeMemory
 
        $Usage = ($UsedMemory / $TotalMemory) * 100
 
        return [math]::Round($Usage, 2)
 
    }

    catch {
 
        return -1

    }

}
 
# =========================

# DISK CHECK

# =========================
 
function Get-DiskUsage {
 
    try {
 
        $Disk = Get-CimInstance Win32_LogicalDisk `

            -Filter "DeviceID='$Drive'"
 
        if ($null -eq $Disk) {

            return -1

        }
 
        if ($Disk.Size -le 0) {

            return -1

        }
 
        $UsedSpace = $Disk.Size - $Disk.FreeSpace
 
        $Usage = ($UsedSpace / $Disk.Size) * 100
 
        return [math]::Round($Usage, 2)
 
    }

    catch {
 
        return -1

    }

}
 
# =========================

# ANGULAR CHECK

# =========================
 
function Test-Angular {
 
    $Result = [PSCustomObject]@{

        Success      = $false

        ResponseTime = -1

        ErrorMessage = ""

    }
 
    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
 
    try {
 
        $Response = Invoke-WebRequest `

            -Uri $AngularUrl `

            -Method GET `

            -TimeoutSec 30 `

            -UseBasicParsing `

            -ErrorAction Stop
 
        $Stopwatch.Stop()
 
        $Result.Success = ($Response.StatusCode -ge 200 -and

                           $Response.StatusCode -lt 400)
 
        $Result.ResponseTime =

            [math]::Round(

                $Stopwatch.Elapsed.TotalMilliseconds,

                2

            )
 
        if (-not $Result.Success) {
 
            $Result.ErrorMessage =

                "HTTP status code: $($Response.StatusCode)"

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
 
# =========================

# BACKEND CHECK

# =========================
 
function Test-Backend {
 
    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
 
    try {
 
        $Test = Test-NetConnection `

            -ComputerName $BackendHost `

            -Port $BackendPort `

            -InformationLevel Quiet `

            -WarningAction SilentlyContinue
 
        $Stopwatch.Stop()
 
        return [PSCustomObject]@{

            Success      = [bool]$Test

            ResponseTime = [math]::Round(

                $Stopwatch.Elapsed.TotalMilliseconds,

                2

            )

            ErrorMessage = if ($Test) {

                ""

            }

            else {

                "Backend port $BackendPort is not reachable."

            }

        }

    }

    catch {
 
        $Stopwatch.Stop()
 
        return [PSCustomObject]@{

            Success      = $false

            ResponseTime = [math]::Round(

                $Stopwatch.Elapsed.TotalMilliseconds,

                2

            )

            ErrorMessage = $_.Exception.Message

        }

    }

}
 
# =========================

# DATABASE CHECK

# TCP PORT ONLY

# =========================
 
function Test-Database {
 
    $Result = [PSCustomObject]@{

        Success      = $false

        ResponseTime = -1

        ErrorMessage = ""

        CheckType    = "TCP"

    }
 
    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
 
    try {
 
        $Test = Test-NetConnection `

            -ComputerName $DBHost `

            -Port $DBPort `

            -InformationLevel Quiet `

            -WarningAction SilentlyContinue
 
        $Stopwatch.Stop()
 
        $Result.Success = [bool]$Test
 
        $Result.ResponseTime =

            [math]::Round(

                $Stopwatch.Elapsed.TotalMilliseconds,

                2

            )
 
        $Result.CheckType = "TCP"
 
        if (-not $Result.Success) {
 
            $Result.ErrorMessage =

                "PostgreSQL port $DBPort is not reachable."

        }

        else {
 
            $Result.ErrorMessage = ""

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
 
        $Result.CheckType = "TCP"
 
        $Result.ErrorMessage =

            $_.Exception.Message

    }
 
    return $Result

}
 
# =========================

# HEALTH JSON

# =========================
 
function Write-HealthJson {
 
    param(

        $Timestamp,

        $CPU,

        $Memory,

        $Disk,

        $Angular,

        $Backend,

        $Database,

        $OverallStatus,

        $Warnings,

        $Critical

    )
 
    # -------------------------

    # CPU STATUS

    # -------------------------
 
    $CPUStatus = "NORMAL"
 
    if ($CPU -ge $CPUCritical) {

        $CPUStatus = "CRITICAL"

    }

    elseif ($CPU -ge $CPUWarning) {

        $CPUStatus = "WARNING"

    }
 
    # -------------------------

    # MEMORY STATUS

    # -------------------------
 
    $MemoryStatus = "NORMAL"
 
    if ($Memory -ge $MemoryCritical) {

        $MemoryStatus = "CRITICAL"

    }

    elseif ($Memory -ge $MemoryWarning) {

        $MemoryStatus = "WARNING"

    }
 
    # -------------------------

    # DISK STATUS

    # -------------------------
 
    $DiskStatus = "NORMAL"
 
    if ($Disk -ge $DiskCritical) {

        $DiskStatus = "CRITICAL"

    }

    elseif ($Disk -ge $DiskWarning) {

        $DiskStatus = "WARNING"

    }
 
    # -------------------------

    # ANGULAR STATUS

    # -------------------------
 
    if (-not $Angular.Success) {
 
        $AngularStatus = "DOWN"

    }

    elseif ($Angular.ResponseTime -ge $AngularCritical) {
 
        $AngularStatus = "CRITICAL"

    }

    elseif ($Angular.ResponseTime -ge $AngularWarning) {
 
        $AngularStatus = "WARNING"

    }

    else {
 
        $AngularStatus = "UP"

    }
 
    # -------------------------

    # BACKEND STATUS

    # -------------------------
 
    if ($Backend.Success) {

        $BackendStatus = "UP"

    }

    else {

        $BackendStatus = "DOWN"

    }
 
    # -------------------------

    # DATABASE STATUS

    # TCP ONLY

    # -------------------------
 
    if ($Database.Success) {

        $DatabaseStatus = "UP"

    }

    else {

        $DatabaseStatus = "DOWN"

    }
 
    # -------------------------

    # HEALTH OBJECT

    # -------------------------
 
    $Health = [PSCustomObject]@{
 
        timestamp = $Timestamp
 
        computer = $env:COMPUTERNAME
 
        overallStatus = $OverallStatus
 
        system = [PSCustomObject]@{
 
            cpu = [PSCustomObject]@{

                usage = $CPU

                status = $CPUStatus

            }
 
            memory = [PSCustomObject]@{

                usage = $Memory

                status = $MemoryStatus

            }
 
            disk = [PSCustomObject]@{

                drive = $Drive

                usage = $Disk

                status = $DiskStatus

            }

        }
 
        services = [PSCustomObject]@{
 
            angular = [PSCustomObject]@{

                url = $AngularUrl

                status = $AngularStatus

                responseTime = $Angular.ResponseTime

                error = $Angular.ErrorMessage

            }
 
            backend = [PSCustomObject]@{

                host = $BackendHost

                port = $BackendPort

                status = $BackendStatus

                responseTime = $Backend.ResponseTime

                error = $Backend.ErrorMessage

            }
 
            database = [PSCustomObject]@{

                status = $DatabaseStatus

                host = $DBHost

                port = $DBPort

                name = $DBName

                responseTime = $Database.ResponseTime

                checkType = "TCP"

                error = $Database.ErrorMessage

            }

        }
 
        warnings = @($Warnings)
 
        critical = @($Critical)

    }
 
    $Health |

        ConvertTo-Json -Depth 10 |

        Set-Content `

            -Path $HealthFile `

            -Encoding UTF8

}
 
# =========================

# MAIN MONITORING LOOP

# =========================
 
Write-Host ""

Write-Host "===================================================="

Write-Host "        WINDOWS APPLICATION MONITOR"

Write-Host "===================================================="

Write-Host ""

Write-Host "Angular  : $AngularUrl"

Write-Host "Backend  : $BackendHost`:$BackendPort"

Write-Host "Database : $DBHost`:$DBPort"

Write-Host "DB Check : TCP PORT ONLY"

Write-Host ""

Write-Host "Monitoring started..."

Write-Host ""
 
while ($true) {
 
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
 
    # =========================

    # GET SYSTEM METRICS

    # =========================
 
    $CPU = Get-CPUUsage

    $Memory = Get-MemoryUsage

    $Disk = Get-DiskUsage
 
    # =========================

    # APPLICATION CHECKS

    # =========================
 
    $Angular = Test-Angular
 
    $Backend = Test-Backend
 
    $Database = Test-Database
 
    # =========================

    # STATUS ARRAYS

    # =========================
 
    $Warnings = @()

    $Critical = @()
 
    $OverallStatus = "HEALTHY"
 
    # =========================

    # CPU

    # =========================
 
    if ($CPU -ge $CPUCritical) {
 
        $CPUHighSamples++
 
        if ($CPUHighSamples -ge $RequiredHighSamples) {
 
            $OverallStatus = "CRITICAL"
 
            $Message =

                "CPU usage is $CPU%. Critical threshold is $CPUCritical%."
 
            $Critical += $Message
 
            Add-Content `

                -Path $AlertFile `

                -Value "$Timestamp - CRITICAL - $Message" `

                -Encoding UTF8

        }

    }

    elseif ($CPU -ge $CPUWarning) {
 
        $CPUHighSamples = 0
 
        if ($OverallStatus -ne "CRITICAL") {

            $OverallStatus = "WARNING"

        }
 
        $Message =

            "CPU usage is $CPU%. Warning threshold is $CPUWarning%."
 
        $Warnings += $Message

    }

    else {
 
        $CPUHighSamples = 0

    }
 
    # =========================

    # MEMORY

    # =========================
 
    if ($Memory -ge $MemoryCritical) {
 
        $MemoryHighSamples++
 
        if ($MemoryHighSamples -ge $RequiredHighSamples) {
 
            $OverallStatus = "CRITICAL"
 
            $Message =

                "Memory usage is $Memory%. Critical threshold is $MemoryCritical%."
 
            $Critical += $Message
 
            Add-Content `

                -Path $AlertFile `

                -Value "$Timestamp - CRITICAL - $Message" `

                -Encoding UTF8

        }

    }

    elseif ($Memory -ge $MemoryWarning) {
 
        $MemoryHighSamples = 0
 
        if ($OverallStatus -ne "CRITICAL") {

            $OverallStatus = "WARNING"

        }
 
        $Message =

            "Memory usage is $Memory%. Warning threshold is $MemoryWarning%."
 
        $Warnings += $Message

    }

    else {
 
        $MemoryHighSamples = 0

    }
 
    # =========================

    # DISK

    # =========================
 
    if ($Disk -ge $DiskCritical) {
 
        $DiskHighSamples++
 
        if ($DiskHighSamples -ge $RequiredHighSamples) {
 
            $OverallStatus = "CRITICAL"
 
            $Message =

                "Disk usage on $Drive is $Disk%. Critical threshold is $DiskCritical%."
 
            $Critical += $Message
 
            Add-Content `

                -Path $AlertFile `

                -Value "$Timestamp - CRITICAL - $Message" `

                -Encoding UTF8

        }

    }

    elseif ($Disk -ge $DiskWarning) {
 
        $DiskHighSamples = 0
 
        if ($OverallStatus -ne "CRITICAL") {

            $OverallStatus = "WARNING"

        }
 
        $Message =

            "Disk usage on $Drive is $Disk%. Warning threshold is $DiskWarning%."
 
        $Warnings += $Message

    }

    else {
 
        $DiskHighSamples = 0

    }
 
    # =========================

    # ANGULAR

    # =========================
 
    if (-not $Angular.Success) {
 
        $OverallStatus = "CRITICAL"
 
        $Message =

            "Angular application is DOWN. $($Angular.ErrorMessage)"
 
        $Critical += $Message
 
        Add-Content `

            -Path $AlertFile `

            -Value "$Timestamp - CRITICAL - $Message" `

            -Encoding UTF8

    }

    elseif ($Angular.ResponseTime -ge $AngularCritical) {
 
        $AngularHighSamples++
 
        if ($AngularHighSamples -ge $RequiredHighSamples) {
 
            $OverallStatus = "CRITICAL"
 
            $Message =

                "Angular response time is $($Angular.ResponseTime) ms."
 
            $Critical += $Message
 
            Add-Content `

                -Path $AlertFile `

                -Value "$Timestamp - CRITICAL - $Message" `

                -Encoding UTF8

        }

    }

    elseif ($Angular.ResponseTime -ge $AngularWarning) {
 
        $AngularHighSamples = 0
 
        if ($OverallStatus -ne "CRITICAL") {

            $OverallStatus = "WARNING"

        }
 
        $Message =

            "Angular response time is $($Angular.ResponseTime) ms."
 
        $Warnings += $Message

    }

    else {
 
        $AngularHighSamples = 0

    }
 
    # =========================

    # BACKEND

    # =========================
 
    if (-not $Backend.Success) {
 
        $OverallStatus = "CRITICAL"
 
        $Message =

            "Backend $BackendHost`:$BackendPort is DOWN."
 
        $Critical += $Message
 
        Add-Content `

            -Path $AlertFile `

            -Value "$Timestamp - CRITICAL - $Message $($Backend.ErrorMessage)" `

            -Encoding UTF8

    }
 
    # =========================

    # DATABASE

    # TCP PORT ONLY

    # =========================
 
    if (-not $Database.Success) {
 
        $OverallStatus = "CRITICAL"
 
        $Message =

            "PostgreSQL server $DBHost`:$DBPort is DOWN."
 
        $Critical += $Message
 
        Add-Content `

            -Path $AlertFile `

            -Value "$Timestamp - CRITICAL - $Message $($Database.ErrorMessage)" `

            -Encoding UTF8

    }
 
    # =========================

    # WRITE CSV

    # =========================
 
    $CsvLine = @(

        $Timestamp,

        $CPU,

        $Memory,

        $Disk,

        $(if ($Angular.Success) { "UP" } else { "DOWN" }),

        $Angular.ResponseTime,

        $BackendHost,

        $BackendPort,

        $(if ($Backend.Success) { "UP" } else { "DOWN" }),

        $DBHost,

        $DBPort,

        $(if ($Database.Success) { "UP" } else { "DOWN" }),

        $Database.ResponseTime,

        $OverallStatus

    ) -join ","
 
    Add-Content `

        -Path $CsvFile `

        -Value $CsvLine `

        -Encoding UTF8
 
    # =========================

    # WRITE HEALTH JSON

    # =========================
 
    Write-HealthJson `

        -Timestamp $Timestamp `

        -CPU $CPU `

        -Memory $Memory `

        -Disk $Disk `

        -Angular $Angular `

        -Backend $Backend `

        -Database $Database `

        -OverallStatus $OverallStatus `

        -Warnings $Warnings `

        -Critical $Critical
 
    # =========================

    # CONSOLE OUTPUT

    # =========================
 
    Clear-Host
 
    Write-Host "===================================================="

    Write-Host "        WINDOWS APPLICATION MONITOR"

    Write-Host "===================================================="

    Write-Host ""
 
    Write-Host "Timestamp : $Timestamp"

    Write-Host "Computer  : $env:COMPUTERNAME"

    Write-Host ""
 
    Write-Host "---------------- SYSTEM ----------------"
 
    Write-Host "CPU       : $CPU %"
 
    Write-Host "Memory    : $Memory %"
 
    Write-Host "Disk $Drive : $Disk %"
 
    Write-Host ""
 
    Write-Host "---------------- ANGULAR ----------------"
 
    if ($Angular.Success) {
 
        Write-Host "Status    : UP"

        Write-Host "Response  : $($Angular.ResponseTime) ms"
 
    }

    else {
 
        Write-Host "Status    : DOWN"

        Write-Host "Error     : $($Angular.ErrorMessage)"

    }
 
    Write-Host ""
 
    Write-Host "---------------- BACKEND ----------------"
 
    if ($Backend.Success) {
 
        Write-Host "Status    : UP"

        Write-Host "Host      : $BackendHost"

        Write-Host "Port      : $BackendPort"

        Write-Host "Response  : $($Backend.ResponseTime) ms"
 
    }

    else {
 
        Write-Host "Status    : DOWN"

        Write-Host "Host      : $BackendHost"

        Write-Host "Port      : $BackendPort"

        Write-Host "Error     : $($Backend.ErrorMessage)"

    }
 
    Write-Host ""
 
    Write-Host "---------------- DATABASE ----------------"
 
    if ($Database.Success) {
 
        Write-Host "Status    : UP"

        Write-Host "Host      : $DBHost"

        Write-Host "Port      : $DBPort"

        Write-Host "Check     : TCP"

        Write-Host "Response  : $($Database.ResponseTime) ms"
 
    }

    else {
 
        Write-Host "Status    : DOWN"

        Write-Host "Host      : $DBHost"

        Write-Host "Port      : $DBPort"

        Write-Host "Check     : TCP"

        Write-Host "Error     : $($Database.ErrorMessage)"

    }
 
    Write-Host ""
 
    Write-Host "---------------- OVERALL ----------------"
 
    Write-Host "Status    : $OverallStatus"
 
    Write-Host ""
 
    Write-Host "Files:"

    Write-Host "CSV       : $CsvFile"

    Write-Host "Alerts    : $AlertFile"

    Write-Host "Health    : $HealthFile"
 
    Write-Host ""

    Write-Host "Next check in $CheckIntervalSeconds seconds..."
 
    Start-Sleep -Seconds $CheckIntervalSeconds

}
 
