# START> Tharyn | ZedUI DisplayMenu
#     2025-12-30
#     What: Display enumeration script for ZedUI
#     Why: External script avoids inline PowerShell escaping issues
#     Expected: Returns JSON array with display info including device names and current resolution

<#
.SYNOPSIS
    Enumerate connected displays with device names and current resolutions.

.DESCRIPTION
    Returns JSON array of display information for ZedUI display resolution menu.
    Uses Windows.Forms to get display list, then queries current resolution for each.

.OUTPUTS
    JSON array with format:
    [
      {
        "deviceName": "\\\\.\\\\DISPLAY1",
        "displayNumber": 1,
        "currentWidth": 2560,
        "currentHeight": 1440,
        "isPrimary": true
      },
      ...
    ]

.NOTES
    External script approach is more reliable than inline PowerShell through Node.js exec()
#>

# Add Windows.Forms for display enumeration
Add-Type -AssemblyName System.Windows.Forms

# Get all screens
$screens = [System.Windows.Forms.Screen]::AllScreens

# Build result array
$displays = @()

foreach ($screen in $screens) {
    # Extract display number from device name (e.g., "\\.\\DISPLAY1" -> 1)
    # Windows can have non-sequential numbers (1, 3 if 2 is disabled)
    $deviceName = $screen.DeviceName
    if ($deviceName -match 'DISPLAY(\d+)') {
        $displayNumber = [int]$Matches[1]
    } else {
        # Fallback if pattern doesn't match
        $displayNumber = 0
    }

    $displays += [PSCustomObject]@{
        deviceName = $deviceName
        displayNumber = $displayNumber
        currentWidth = $screen.Bounds.Width
        currentHeight = $screen.Bounds.Height
        isPrimary = $screen.Primary
    }
}

# Sort by display number (Windows display number, not array index)
$displays = $displays | Sort-Object -Property displayNumber

# Output as JSON
$displays | ConvertTo-Json -Compress

# <END Tharyn | ZedUI DisplayMenu
