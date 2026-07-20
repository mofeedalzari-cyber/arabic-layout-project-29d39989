#Requires -Version 5.1
<#
.SYNOPSIS
    بناء مشروع Android APK تلقائيًا باستخدام Capacitor.
.DESCRIPTION
    يقوم هذا السكربت بـ:
    - npm install
    - npm run build
    - حذف مجلد android القديم (إن وجد)
    - npx cap add android
    - npx cap sync android
    - فتح Android Studio (اختياري)
.NOTES
    يجب تشغيل هذا السكربت من داخل مجلد المشروع الجذر.
#>

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Invoke-CommandWithCheck {
    param(
        [string]$Command,
        [string]$Arguments = ""
    )
    Write-Host ">>> $Command $Arguments" -ForegroundColor Yellow
    $process = Start-Process -FilePath $Command -ArgumentList $Arguments -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "فشل تنفيذ: $Command $Arguments (رمز الخروج: $($process.ExitCode))"
    }
}

# التحقق من وجود Node.js و npm
Write-Step "التحقق من المتطلبات"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js غير مثبت. يُرجى تثبيت Node.js 20+ من https://nodejs.org"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm غير مثبت. يُرجى تثبيت Node.js 20+"
}

Write-Host "Node: $(node -v)" -ForegroundColor Green
Write-Host "npm: v$(npm -v)" -ForegroundColor Green

# 1) npm install
Write-Step "1/5 - تثبيت الحزم (npm install)"
Invoke-CommandWithCheck -Command "npm" -Arguments "install"

# 2) npm run build
Write-Step "2/5 - بناء أصول الويب (npm run build)"
Invoke-CommandWithCheck -Command "npm" -Arguments "run build"

# 3) حذف مجلد android القديم
Write-Step "3/5 - حذف مجلد android القديم (إن وجد)"
$androidPath = Join-Path $PSScriptRoot "android"
if (Test-Path $androidPath) {
    Remove-Item -Path $androidPath -Recurse -Force
    Write-Host "تم حذف مجلد android." -ForegroundColor Green
} else {
    Write-Host "لا يوجد مجلد android سابق." -ForegroundColor Green
}

# 4) npx cap add android
Write-Step "4/5 - إضافة منصة Android (npx cap add android)"
Invoke-CommandWithCheck -Command "npx" -Arguments "cap add android"

# 5) npx cap sync android
Write-Step "5/5 - مزامنة Capacitor مع Android (npx cap sync android)"
Invoke-CommandWithCheck -Command "npx" -Arguments "cap sync android"

Write-Step "اكتمل البناء بنجاح"
Write-Host "يمكنك الآن فتح المشروع في Android Studio بتشغيل:" -ForegroundColor Green
Write-Host "    npx cap open android" -ForegroundColor White

# سؤال المستخدم إذا أراد فتح Android Studio تلقائيًا
$openStudio = Read-Host "هل تريد فتح Android Studio الآن؟ (y/n)"
if ($openStudio -match "^[yY]") {
    Invoke-CommandWithCheck -Command "npx" -Arguments "cap open android"
}
