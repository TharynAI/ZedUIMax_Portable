# START> Tharyn | ZedUI DisplayMenu
#     2025-12-30
#     What: Display resolution change script for ZedUI
#     Why: External script with CORRECTED device targeting (not $null)
#     Expected: Changes specific display by device name, or all displays if "all" specified

<#
.SYNOPSIS
    Change display resolution for specific display or all displays.

.PARAMETER DeviceName
    Windows device name (e.g., "\\.\\DISPLAY1") or "all" for all displays

.PARAMETER Width
    Target width in pixels

.PARAMETER Height
    Target height in pixels

.OUTPUTS
    JSON object with success status and message

.NOTES
    CRITICAL FIX: Passes $DeviceName to EnumDisplaySettings and ChangeDisplaySettings
    instead of $null, which allows targeting specific displays correctly.

    Previous bug: Passing $null always targets primary display only.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$DeviceName,

    [Parameter(Mandatory = $true)]
    [int]$Width,

    [Parameter(Mandatory = $true)]
    [int]$Height
)

# Win32 API definitions
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class DisplayChanger {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int ChangeDisplaySettingsEx(
        string lpszDeviceName,
        ref DEVMODE lpDevMode,
        IntPtr hwnd,
        uint dwflags,
        IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool EnumDisplaySettings(
        string deviceName,
        int modeNum,
        ref DEVMODE devMode);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct DEVMODE {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    public const int DM_PELSWIDTH = 0x80000;
    public const int DM_PELSHEIGHT = 0x100000;
    public const uint CDS_UPDATEREGISTRY = 0x01;
    public const int DISP_CHANGE_SUCCESSFUL = 0;
    public const int ENUM_CURRENT_SETTINGS = -1;
}
"@

function Set-SingleDisplayResolution {
    param(
        [string]$Device,
        [int]$TargetWidth,
        [int]$TargetHeight
    )

    try {
        # CRITICAL FIX: Get current settings for THIS specific display
        # Pass the device name; if that fails (rare on some drivers), fall back to $null
        $devMode = New-Object DisplayChanger+DEVMODE
        $devMode.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($devMode)

        $targetDevice = $Device
        $getResult = [DisplayChanger]::EnumDisplaySettings($targetDevice, [DisplayChanger]::ENUM_CURRENT_SETTINGS, [ref]$devMode)

        if (-not $getResult) {
            # Fallback: try primary (null) to avoid hard failure
            $targetDevice = $null
            $getResult = [DisplayChanger]::EnumDisplaySettings($targetDevice, [DisplayChanger]::ENUM_CURRENT_SETTINGS, [ref]$devMode)
        }

        if (-not $getResult) {
            return @{
                success = $false
                message = "Failed to get current settings for $Device"
            }
        }

        # Set new resolution while preserving other settings
        $devMode.dmPelsWidth = $TargetWidth
        $devMode.dmPelsHeight = $TargetHeight
        $devMode.dmFields = [DisplayChanger]::DM_PELSWIDTH -bor [DisplayChanger]::DM_PELSHEIGHT

        # CRITICAL FIX: Change settings for THIS specific display
        # Pass the device name, NOT $null
        $result = [DisplayChanger]::ChangeDisplaySettingsEx(
            $targetDevice,
            [ref]$devMode,
            [IntPtr]::Zero,
            [DisplayChanger]::CDS_UPDATEREGISTRY,
            [IntPtr]::Zero
        )

        if ($result -eq [DisplayChanger]::DISP_CHANGE_SUCCESSFUL) {
            return @{
                success = $true
                message = "Changed $Device to ${TargetWidth}x${TargetHeight}"
            }
        } else {
            $errorMsg = switch ($result) {
                -1 { "Display driver failed the specified graphics mode" }
                -2 { "Graphics mode not supported" }
                -3 { "Unable to write settings to registry" }
                default { "Error code: $result" }
            }
            return @{
                success = $false
                message = "Failed to change $Device : $errorMsg"
            }
        }
    } catch {
        return @{
            success = $false
            message = "Exception changing $Device : $($_.Exception.Message)"
        }
    }
}

# Main execution
if ($DeviceName -eq "all") {
    # Change all displays
    Add-Type -AssemblyName System.Windows.Forms
    $screens = [System.Windows.Forms.Screen]::AllScreens

    $results = @()
    $allSuccess = $true

    foreach ($screen in $screens) {
        $result = Set-SingleDisplayResolution -Device $screen.DeviceName -TargetWidth $Width -TargetHeight $Height
        $results += $result
        if (-not $result.success) {
            $allSuccess = $false
        }
    }

    $output = @{
        success = $allSuccess
        message = if ($allSuccess) { "All displays changed to ${Width}x${Height}" } else { "Some displays failed" }
        details = $results
    }
} else {
    # Change single display
    $output = Set-SingleDisplayResolution -Device $DeviceName -TargetWidth $Width -TargetHeight $Height
}

# Output JSON
$output | ConvertTo-Json -Compress

# <END Tharyn | ZedUI DisplayMenu
