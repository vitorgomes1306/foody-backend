param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class ChefitoRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool ClosePrinter(IntPtr printerHandle);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] private static extern int StartDocPrinter(IntPtr printerHandle, int level, [In] DOC_INFO_1 docInfo);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool EndDocPrinter(IntPtr printerHandle);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool StartPagePrinter(IntPtr printerHandle);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool EndPagePrinter(IntPtr printerHandle);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool WritePrinter(IntPtr printerHandle, IntPtr bytes, int count, out int written);

    public static void Send(string printerName, byte[] data)
    {
        IntPtr printer = IntPtr.Zero;
        IntPtr unmanagedBytes = IntPtr.Zero;
        bool documentStarted = false;
        bool pageStarted = false;
        try
        {
            if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
            var document = new DOC_INFO_1 { pDocName = "Chefito - Pedido", pDataType = "RAW", pOutputFile = null };
            if (StartDocPrinter(printer, 1, document) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            documentStarted = true;
            if (!StartPagePrinter(printer)) throw new Win32Exception(Marshal.GetLastWin32Error());
            pageStarted = true;
            unmanagedBytes = Marshal.AllocCoTaskMem(data.Length);
            Marshal.Copy(data, 0, unmanagedBytes, data.Length);
            int written = 0;
            if (!WritePrinter(printer, unmanagedBytes, data.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());
            if (written != data.Length) throw new Exception("A impressora recebeu apenas " + written + " de " + data.Length + " bytes.");
        }
        finally
        {
            if (unmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(unmanagedBytes);
            if (pageStarted) EndPagePrinter(printer);
            if (documentStarted) EndDocPrinter(printer);
            if (printer != IntPtr.Zero) ClosePrinter(printer);
        }
    }
}
"@

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $FilePath))
[ChefitoRawPrinter]::Send($PrinterName, $bytes)
