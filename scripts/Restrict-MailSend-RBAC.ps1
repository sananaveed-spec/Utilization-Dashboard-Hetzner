<#
.SYNOPSIS
  Restricts the Azure app so it can send mail only as timesheets@allumiax.com
  using Exchange Online Application RBAC. (Exchange Online only - no Graph module)

.NOTES
  Before running, copy the Enterprise application Object ID from Azure Portal:
  Entra ID > Enterprise applications > Timesheets Mail API > Overview > Object ID

  Example:
    .\scripts\Restrict-MailSend-RBAC.ps1 -ObjectId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ObjectId,

  [string]$AppId = "7ddcec73-a05e-4a59-bb86-6f9bdd6f1336",
  [string]$Mailbox = "timesheets@allumiax.com",
  [string]$ScopeName = "Timesheets Mailbox Only",
  [string]$RoleAssignmentName = "Timesheet App - Mail.Send",
  [string]$ServicePrincipalDisplayName = "Timesheet Mail Sender"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Restrict Mail.Send via Exchange Application RBAC ===" -ForegroundColor Green
Write-Host "AppId:    $AppId"
Write-Host "ObjectId: $ObjectId"
Write-Host "Mailbox:  $Mailbox"
Write-Host "Scope:    $ScopeName"
Write-Host ""

if ($ObjectId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
  throw "ObjectId looks invalid. It must be a GUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx. Re-copy it from Enterprise applications > Timesheets Mail API > Overview."
}

if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
  Write-Host "Installing ExchangeOnlineManagement..." -ForegroundColor Cyan
  Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force -AllowClobber
}
Import-Module ExchangeOnlineManagement -Force

Write-Host "Signing in to Exchange Online (browser will open)..." -ForegroundColor Cyan
Connect-ExchangeOnline -ShowBanner:$false

# --- Exchange service principal pointer ---
$exoSp = Get-ServicePrincipal -ErrorAction SilentlyContinue | Where-Object {
  $_.AppId -eq $AppId -or $_.ObjectId -eq $ObjectId
}

if (-not $exoSp) {
  Write-Host "Creating Exchange service principal pointer..." -ForegroundColor Cyan
  $exoSp = New-ServicePrincipal -AppId $AppId -ObjectId $ObjectId -DisplayName $ServicePrincipalDisplayName
  Write-Host "  Created: $($exoSp.DisplayName)" -ForegroundColor Green
}
else {
  Write-Host "Exchange service principal already exists: $($exoSp.DisplayName)" -ForegroundColor Yellow
}

# --- Management scope ---
$existingScope = Get-ManagementScope -Identity $ScopeName -ErrorAction SilentlyContinue
if (-not $existingScope) {
  Write-Host "Creating management scope '$ScopeName'..." -ForegroundColor Cyan
  New-ManagementScope -Name $ScopeName -RecipientRestrictionFilter "PrimarySmtpAddress -eq '$Mailbox'" | Out-Null
  Write-Host "  Scope created." -ForegroundColor Green
}
else {
  Write-Host "Management scope already exists: $ScopeName" -ForegroundColor Yellow
}

$mbx = Get-EXOMailbox -Identity $Mailbox -ErrorAction SilentlyContinue
if (-not $mbx) {
  Write-Warning "Mailbox '$Mailbox' was not found. Check the address."
}
else {
  Write-Host "Target mailbox OK: $($mbx.PrimarySmtpAddress)" -ForegroundColor Green
}

# --- Role assignment ---
$existingAssignment = Get-ManagementRoleAssignment -Identity $RoleAssignmentName -ErrorAction SilentlyContinue
if (-not $existingAssignment) {
  Write-Host "Assigning 'Application Mail.Send' scoped to '$ScopeName'..." -ForegroundColor Cyan
  New-ManagementRoleAssignment -Name $RoleAssignmentName -App $ObjectId -Role "Application Mail.Send" -CustomResourceScope $ScopeName | Out-Null
  Write-Host "  Role assignment created." -ForegroundColor Green
}
else {
  Write-Host "Role assignment already exists: $RoleAssignmentName" -ForegroundColor Yellow
}

# --- Test ---
Write-Host ""
Write-Host "Testing authorization against $Mailbox ..." -ForegroundColor Cyan
$testAllowed = Test-ServicePrincipalAuthorization -Identity $ObjectId -Resource $Mailbox
$testAllowed | Format-Table RoleName, Granted, InScope, AllowedResourceScope -AutoSize

$mailSendTest = $testAllowed | Where-Object { $_.RoleName -eq "Application Mail.Send" }
if ($mailSendTest -and ($mailSendTest.InScope -eq $true -or $mailSendTest.InScope -eq "True")) {
  Write-Host "SUCCESS: Application Mail.Send is InScope for $Mailbox" -ForegroundColor Green
}
else {
  Write-Warning "Application Mail.Send was not reported InScope for $Mailbox. Review the table above."
}

Write-Host ""
Write-Host "IMPORTANT - do this in Azure Portal next:" -ForegroundColor Yellow
Write-Host "  1. Open Timesheets Mail API > API permissions"
Write-Host "  2. Remove Mail.Send (Type: Application)"
Write-Host "  3. Click Grant admin consent again"
Write-Host "  (If you leave Graph Mail.Send, the app can still send as ANY user.)"
Write-Host ""

Disconnect-ExchangeOnline -Confirm:$false
Write-Host "Exchange setup complete." -ForegroundColor Green
Write-Host ""
