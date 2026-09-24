#!/bin/bash

# ============================================================
# LINUX / RHEL APPLICATION MONITOR - VERSION 4
# ============================================================
# Monitors:
#   - CPU
#   - Memory
#   - Disk
#   - Angular application
#   - Backend TCP port
#   - PostgreSQL TCP port
#
# PostgreSQL:
#   TCP PORT CHECK ONLY
#   No psql authentication required
#
# Output:
#   - monitor_output/application_metrics.csv
#   - monitor_output/alerts.log
#   - monitor_output/health.json
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

ANGULAR_URL="http://192.168.29.71:8200/welcome"

BACKEND_HOST="192.168.29.71"
BACKEND_PORT=8080

DB_HOST="192.168.29.98"
DB_PORT=5432
DB_NAME="wildplant"

# Monitoring interval
CHECK_INTERVAL_SECONDS=5

# Thresholds
CPU_WARNING=80
CPU_CRITICAL=90

MEMORY_WARNING=80
MEMORY_CRITICAL=90

DISK_WARNING=80
DISK_CRITICAL=90

ANGULAR_WARNING=500
ANGULAR_CRITICAL=1000

# Number of continuous critical samples
REQUIRED_HIGH_SAMPLES=3

# Disk to monitor
DRIVE="/"


# ============================================================
# SCRIPT DIRECTORY
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# ============================================================
# OUTPUT DIRECTORY
# ============================================================

OUTPUT_DIRECTORY="$SCRIPT_DIR/monitor_output"

mkdir -p "$OUTPUT_DIRECTORY"

CSV_FILE="$OUTPUT_DIRECTORY/application_metrics.csv"
ALERT_FILE="$OUTPUT_DIRECTORY/alerts.log"
HEALTH_FILE="$OUTPUT_DIRECTORY/health.json"


# ============================================================
# CSV HEADER
# ============================================================

if [ ! -f "$CSV_FILE" ]; then

    echo "Timestamp,CPU_Percent,Memory_Percent,Disk_Percent,Angular_Status,Angular_Response_ms,Backend_Host,Backend_Port,Backend_Status,Database_Host,Database_Port,Database_Status,Database_Response_ms,Overall_Status" \
        > "$CSV_FILE"

fi


# ============================================================
# HIGH SAMPLE COUNTERS
# ============================================================

CPU_HIGH_SAMPLES=0
MEMORY_HIGH_SAMPLES=0
DISK_HIGH_SAMPLES=0
ANGULAR_HIGH_SAMPLES=0


# ============================================================
# GET CPU USAGE
# ============================================================

get_cpu_usage()
{
    CPU=$(top -bn1 | awk '/Cpu\(s\)/ {

        idle=$8

        gsub(",", ".", idle)

        print 100-idle

    }')

    if [ -z "$CPU" ]; then
        echo "-1"
        return
    fi

    printf "%.2f\n" "$CPU"
}


# ============================================================
# GET MEMORY USAGE
# ============================================================

get_memory_usage()
{
    MEMORY=$(free | awk '/Mem:/ {

        if ($2 > 0)
            printf "%.2f", (($2-$7)/$2)*100

    }')

    if [ -z "$MEMORY" ]; then
        echo "-1"
        return
    fi

    echo "$MEMORY"
}


# ============================================================
# GET DISK USAGE
# ============================================================

get_disk_usage()
{
    DISK=$(df -P "$DRIVE" 2>/dev/null |
        awk 'NR==2 {
            gsub("%","",$5)
            print $5
        }')

    if [ -z "$DISK" ]; then
        echo "-1"
        return
    fi

    echo "$DISK"
}


# ============================================================
# ANGULAR CHECK
# ============================================================

test_angular()
{
    ANGULAR_START=$(date +%s%3N)

    HTTP_CODE=$(curl \
        -L \
        -s \
        -o /dev/null \
        -w "%{http_code}" \
        --connect-timeout 10 \
        --max-time 30 \
        "$ANGULAR_URL" 2>/dev/null)

    ANGULAR_END=$(date +%s%3N)

    ANGULAR_RESPONSE_TIME=$((ANGULAR_END - ANGULAR_START))

    if [[ "$HTTP_CODE" =~ ^[0-9]+$ ]] &&
       [ "$HTTP_CODE" -ge 200 ] &&
       [ "$HTTP_CODE" -lt 400 ]; then

        ANGULAR_SUCCESS=true
        ANGULAR_STATUS="UP"
        ANGULAR_ERROR=""

    else

        ANGULAR_SUCCESS=false
        ANGULAR_STATUS="DOWN"

        if [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" = "000" ]; then
            ANGULAR_ERROR="Angular application is not reachable."
        else
            ANGULAR_ERROR="HTTP status code: $HTTP_CODE"
        fi

    fi
}


# ============================================================
# BACKEND TCP CHECK
# ============================================================

test_backend()
{
    BACKEND_START=$(date +%s%3N)

    if timeout 5 bash -c \
        "</dev/tcp/$BACKEND_HOST/$BACKEND_PORT" \
        >/dev/null 2>&1; then

        BACKEND_SUCCESS=true

    else

        BACKEND_SUCCESS=false

    fi

    BACKEND_END=$(date +%s%3N)

    BACKEND_RESPONSE_TIME=$((BACKEND_END - BACKEND_START))

    if [ "$BACKEND_SUCCESS" = true ]; then

        BACKEND_STATUS="UP"
        BACKEND_ERROR=""

    else

        BACKEND_STATUS="DOWN"
        BACKEND_ERROR="Backend port $BACKEND_PORT is not reachable."

    fi
}


# ============================================================
# DATABASE TCP CHECK
# ============================================================

test_database()
{
    DB_START=$(date +%s%3N)

    if timeout 5 bash -c \
        "</dev/tcp/$DB_HOST/$DB_PORT" \
        >/dev/null 2>&1; then

        DB_SUCCESS=true

    else

        DB_SUCCESS=false

    fi

    DB_END=$(date +%s%3N)

    DB_RESPONSE_TIME=$((DB_END - DB_START))

    if [ "$DB_SUCCESS" = true ]; then

        DB_STATUS="UP"
        DB_ERROR=""

    else

        DB_STATUS="DOWN"
        DB_ERROR="PostgreSQL port $DB_PORT is not reachable."

    fi
}


# ============================================================
# WRITE HEALTH JSON
# ============================================================

write_health_json()
{
    cat > "$HEALTH_FILE" <<EOF
{
    "timestamp": "$TIMESTAMP",
    "computer": "$COMPUTER_NAME",
    "overallStatus": "$OVERALL_STATUS",

    "system": {
        "cpu": {
            "usage": $CPU,
            "status": "$CPU_STATUS"
        },

        "memory": {
            "usage": $MEMORY,
            "status": "$MEMORY_STATUS"
        },

        "disk": {
            "drive": "$DRIVE",
            "usage": $DISK,
            "status": "$DISK_STATUS"
        }
    },

    "services": {

        "angular": {
            "url": "$ANGULAR_URL",
            "status": "$ANGULAR_STATUS",
            "responseTime": $ANGULAR_RESPONSE_TIME,
            "error": "$ANGULAR_ERROR"
        },

        "backend": {
            "host": "$BACKEND_HOST",
            "port": $BACKEND_PORT,
            "status": "$BACKEND_STATUS",
            "responseTime": $BACKEND_RESPONSE_TIME,
            "error": "$BACKEND_ERROR"
        },

        "database": {
            "status": "$DB_STATUS",
            "host": "$DB_HOST",
            "port": $DB_PORT,
            "name": "$DB_NAME",
            "responseTime": $DB_RESPONSE_TIME,
            "checkType": "TCP",
            "error": "$DB_ERROR"
        }
    },

    "alerts": {
        "warnings": $WARNINGS_JSON,
        "critical": $CRITICAL_JSON
    }
}
EOF
}


# ============================================================
# ESCAPE JSON STRING
# ============================================================

json_escape()
{
    printf '%s' "$1" |
        sed \
        -e 's/\\/\\\\/g' \
        -e 's/"/\\"/g'
}


# ============================================================
# MAIN MONITORING LOOP
# ============================================================

COMPUTER_NAME=$(hostname)

echo ""
echo "===================================================="
echo "        LINUX / RHEL APPLICATION MONITOR"
echo "===================================================="
echo ""

echo "Computer  : $COMPUTER_NAME"
echo "Angular   : $ANGULAR_URL"
echo "Backend   : $BACKEND_HOST:$BACKEND_PORT"
echo "Database  : $DB_HOST:$DB_PORT"
echo "DB Check  : TCP PORT ONLY"
echo "Disk      : $DRIVE"

echo ""
echo "Monitoring started..."
echo ""


while true
do

    # ========================================================
    # TIMESTAMP
    # ========================================================

    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')


    # ========================================================
    # SYSTEM METRICS
    # ========================================================

    CPU=$(get_cpu_usage)

    MEMORY=$(get_memory_usage)

    DISK=$(get_disk_usage)


    # ========================================================
    # APPLICATION CHECKS
    # ========================================================

    test_angular

    test_backend

    test_database


    # ========================================================
    # STATUS ARRAYS
    # ========================================================

    WARNINGS=()

    CRITICAL=()

    OVERALL_STATUS="HEALTHY"


    # ========================================================
    # CPU STATUS
    # ========================================================

    if (( $(echo "$CPU >= $CPU_CRITICAL" | bc -l) )); then

        CPU_HIGH_SAMPLES=$((CPU_HIGH_SAMPLES + 1))

        CPU_STATUS="CRITICAL"

        if [ "$CPU_HIGH_SAMPLES" -ge "$REQUIRED_HIGH_SAMPLES" ]; then

            OVERALL_STATUS="CRITICAL"

            MESSAGE="CPU usage is ${CPU}%. Critical threshold is ${CPU_CRITICAL}%."

            CRITICAL+=("$MESSAGE")

            echo "$TIMESTAMP - CRITICAL - $MESSAGE" >> "$ALERT_FILE"

        fi

    elif (( $(echo "$CPU >= $CPU_WARNING" | bc -l) )); then

        CPU_HIGH_SAMPLES=0

        CPU_STATUS="WARNING"

        if [ "$OVERALL_STATUS" != "CRITICAL" ]; then
            OVERALL_STATUS="WARNING"
        fi

        MESSAGE="CPU usage is ${CPU}%. Warning threshold is ${CPU_WARNING}%."

        WARNINGS+=("$MESSAGE")

    else

        CPU_HIGH_SAMPLES=0

        CPU_STATUS="NORMAL"

    fi


    # ========================================================
    # MEMORY STATUS
    # ========================================================

    if (( $(echo "$MEMORY >= $MEMORY_CRITICAL" | bc -l) )); then

        MEMORY_HIGH_SAMPLES=$((MEMORY_HIGH_SAMPLES + 1))

        MEMORY_STATUS="CRITICAL"

        if [ "$MEMORY_HIGH_SAMPLES" -ge "$REQUIRED_HIGH_SAMPLES" ]; then

            OVERALL_STATUS="CRITICAL"

            MESSAGE="Memory usage is ${MEMORY}%. Critical threshold is ${MEMORY_CRITICAL}%."

            CRITICAL+=("$MESSAGE")

            echo "$TIMESTAMP - CRITICAL - $MESSAGE" >> "$ALERT_FILE"

        fi

    elif (( $(echo "$MEMORY >= $MEMORY_WARNING" | bc -l) )); then

        MEMORY_HIGH_SAMPLES=0

        MEMORY_STATUS="WARNING"

        if [ "$OVERALL_STATUS" != "CRITICAL" ]; then
            OVERALL_STATUS="WARNING"
        fi

        MESSAGE="Memory usage is ${MEMORY}%. Warning threshold is ${MEMORY_WARNING}%."

        WARNINGS+=("$MESSAGE")

    else

        MEMORY_HIGH_SAMPLES=0

        MEMORY_STATUS="NORMAL"

    fi


    # ========================================================
    # DISK STATUS
    # ========================================================

    if (( $(echo "$DISK >= $DISK_CRITICAL" | bc -l) )); then

        DISK_HIGH_SAMPLES=$((DISK_HIGH_SAMPLES + 1))

        DISK_STATUS="CRITICAL"

        if [ "$DISK_HIGH_SAMPLES" -ge "$REQUIRED_HIGH_SAMPLES" ]; then

            OVERALL_STATUS="CRITICAL"

            MESSAGE="Disk usage on $DRIVE is ${DISK}%. Critical threshold is ${DISK_CRITICAL}%."

            CRITICAL+=("$MESSAGE")

            echo "$TIMESTAMP - CRITICAL - $MESSAGE" >> "$ALERT_FILE"

        fi

    elif (( $(echo "$DISK >= $DISK_WARNING" | bc -l) )); then

        DISK_HIGH_SAMPLES=0

        DISK_STATUS="WARNING"

        if [ "$OVERALL_STATUS" != "CRITICAL" ]; then
            OVERALL_STATUS="WARNING"
        fi

        MESSAGE="Disk usage on $DRIVE is ${DISK}%. Warning threshold is ${DISK_WARNING}%."

        WARNINGS+=("$MESSAGE")

    else

        DISK_HIGH_SAMPLES=0

        DISK_STATUS="NORMAL"

    fi


    # ========================================================
    # ANGULAR STATUS
    # ========================================================

    if [ "$ANGULAR_SUCCESS" = false ]; then

        OVERALL_STATUS="CRITICAL"

        MESSAGE="Angular application is DOWN. $ANGULAR_ERROR"

        CRITICAL+=("$MESSAGE")

        echo "$TIMESTAMP - CRITICAL - $MESSAGE" >> "$ALERT_FILE"

    elif [ "$ANGULAR_RESPONSE_TIME" -ge "$ANGULAR_CRITICAL" ]; then

        ANGULAR_HIGH_SAMPLES=$((ANGULAR_HIGH_SAMPLES + 1))

        ANGULAR_STATUS="CRITICAL"

        if [ "$ANGULAR_HIGH_SAMPLES" -ge "$REQUIRED_HIGH_SAMPLES" ]; then

            OVERALL_STATUS="CRITICAL"

            MESSAGE="Angular response time is ${ANGULAR_RESPONSE_TIME} ms."

            CRITICAL+=("$MESSAGE")

            echo "$TIMESTAMP - CRITICAL - $MESSAGE" >> "$ALERT_FILE"

        fi

    elif [ "$ANGULAR_RESPONSE_TIME" -ge "$ANGULAR_WARNING" ]; then

        ANGULAR_HIGH_SAMPLES=0

        ANGULAR_STATUS="WARNING"

        if [ "$OVERALL_STATUS" != "CRITICAL" ]; then
            OVERALL_STATUS="WARNING"
        fi

        MESSAGE="Angular response time is ${ANGULAR_RESPONSE_TIME} ms."

        WARNINGS+=("$MESSAGE")

    else

        ANGULAR_HIGH_SAMPLES=0

        ANGULAR_STATUS="UP"

    fi


    # ========================================================
    # BACKEND STATUS
    # ========================================================

    if [ "$BACKEND_SUCCESS" = false ]; then

        OVERALL_STATUS="CRITICAL"

        MESSAGE="Backend $BACKEND_HOST:$BACKEND_PORT is DOWN."

        CRITICAL+=("$MESSAGE")

        echo "$TIMESTAMP - CRITICAL - $MESSAGE $BACKEND_ERROR" \
            >> "$ALERT_FILE"

    fi


    # ========================================================
    # DATABASE STATUS
    # TCP PORT ONLY
    # ========================================================

    if [ "$DB_SUCCESS" = false ]; then

        OVERALL_STATUS="CRITICAL"

        MESSAGE="PostgreSQL server $DB_HOST:$DB_PORT is DOWN."

        CRITICAL+=("$MESSAGE")

        echo "$TIMESTAMP - CRITICAL - $MESSAGE $DB_ERROR" \
            >> "$ALERT_FILE"

    fi


    # ========================================================
    # BUILD WARNINGS JSON
    # ========================================================

    WARNINGS_JSON="["

    FIRST=true

    for MESSAGE in "${WARNINGS[@]}"
    do

        ESCAPED=$(json_escape "$MESSAGE")

        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            WARNINGS_JSON+=","
        fi

        WARNINGS_JSON+="\"$ESCAPED\""

    done

    WARNINGS_JSON+="]"


    # ========================================================
    # BUILD CRITICAL JSON
    # ========================================================

    CRITICAL_JSON="["

    FIRST=true

    for MESSAGE in "${CRITICAL[@]}"
    do

        ESCAPED=$(json_escape "$MESSAGE")

        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            CRITICAL_JSON+=","
        fi

        CRITICAL_JSON+="\"$ESCAPED\""

    done

    CRITICAL_JSON+="]"


    # ========================================================
    # WRITE CSV
    # ========================================================

    if [ "$ANGULAR_SUCCESS" = true ]; then
        ANGULAR_CSV_STATUS="UP"
    else
        ANGULAR_CSV_STATUS="DOWN"
    fi

    if [ "$BACKEND_SUCCESS" = true ]; then
        BACKEND_CSV_STATUS="UP"
    else
        BACKEND_CSV_STATUS="DOWN"
    fi

    if [ "$DB_SUCCESS" = true ]; then
        DB_CSV_STATUS="UP"
    else
        DB_CSV_STATUS="DOWN"
    fi


    echo "$TIMESTAMP,$CPU,$MEMORY,$DISK,$ANGULAR_CSV_STATUS,$ANGULAR_RESPONSE_TIME,$BACKEND_HOST,$BACKEND_PORT,$BACKEND_CSV_STATUS,$DB_HOST,$DB_PORT,$DB_CSV_STATUS,$DB_RESPONSE_TIME,$OVERALL_STATUS" \
        >> "$CSV_FILE"


    # ========================================================
    # WRITE HEALTH JSON
    # ========================================================

    write_health_json


    # ========================================================
    # CONSOLE OUTPUT
    # ========================================================

    clear

    echo "===================================================="
    echo "        LINUX / RHEL APPLICATION MONITOR"
    echo "===================================================="
    echo ""

    echo "Timestamp : $TIMESTAMP"
    echo "Computer  : $COMPUTER_NAME"

    echo ""

    # ========================================================
    # SYSTEM
    # ========================================================

    echo "---------------- SYSTEM ----------------"

    echo "CPU       : $CPU %"

    echo "Memory    : $MEMORY %"

    echo "Disk $DRIVE : $DISK %"

    echo ""


    # ========================================================
    # ANGULAR
    # ========================================================

    echo "---------------- ANGULAR ----------------"

    if [ "$ANGULAR_SUCCESS" = true ]; then

        echo "Status    : UP"
        echo "Response  : $ANGULAR_RESPONSE_TIME ms"

    else

        echo "Status    : DOWN"
        echo "Response  : $ANGULAR_RESPONSE_TIME ms"
        echo "Error     : $ANGULAR_ERROR"

    fi

    echo ""


    # ========================================================
    # BACKEND
    # ========================================================

    echo "---------------- BACKEND ----------------"

    if [ "$BACKEND_SUCCESS" = true ]; then

        echo "Status    : UP"
        echo "Host      : $BACKEND_HOST"
        echo "Port      : $BACKEND_PORT"
        echo "Response  : $BACKEND_RESPONSE_TIME ms"

    else

        echo "Status    : DOWN"
        echo "Host      : $BACKEND_HOST"
        echo "Port      : $BACKEND_PORT"
        echo "Response  : $BACKEND_RESPONSE_TIME ms"
        echo "Error     : $BACKEND_ERROR"

    fi

    echo ""


    # ========================================================
    # DATABASE
    # ========================================================

    echo "---------------- DATABASE ----------------"

    if [ "$DB_SUCCESS" = true ]; then

        echo "Status    : UP"
        echo "Host      : $DB_HOST"
        echo "Port      : $DB_PORT"
        echo "Database  : $DB_NAME"
        echo "Check     : TCP"
        echo "Response  : $DB_RESPONSE_TIME ms"

    else

        echo "Status    : DOWN"
        echo "Host      : $DB_HOST"
        echo "Port      : $DB_PORT"
        echo "Database  : $DB_NAME"
        echo "Check     : TCP"
        echo "Response  : $DB_RESPONSE_TIME ms"
        echo "Error     : $DB_ERROR"

    fi

    echo ""


    # ========================================================
    # OVERALL
    # ========================================================

    echo "---------------- OVERALL ----------------"

    echo "Status    : $OVERALL_STATUS"

    echo ""


    # ========================================================
    # OUTPUT FILES
    # ========================================================

    echo "---------------- FILES ----------------"

    echo "CSV       : $CSV_FILE"

    echo "Alerts    : $ALERT_FILE"

    echo "Health    : $HEALTH_FILE"

    echo ""

    echo "Next check in $CHECK_INTERVAL_SECONDS seconds..."

    sleep "$CHECK_INTERVAL_SECONDS"

done
