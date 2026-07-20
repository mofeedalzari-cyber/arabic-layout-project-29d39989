@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title Build Android APK - Capacitor

echo.
echo ========================================
echo بناء مشروع Android APK تلقائياً
echo ========================================

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبت. ثبّت Node.js 20+ من https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [خطأ] npm غير مثبت. ثبّت Node.js 20+
  pause
  exit /b 1
)

echo Node:
node -v
echo npm:
npm -v

echo.
echo ========================================
echo 1/5 - تثبيت الحزم: npm install
echo ========================================
call npm install
if errorlevel 1 goto failed

echo.
echo ========================================
echo 2/5 - بناء المشروع: npm run build
echo ========================================
call npm run build
if errorlevel 1 goto failed

echo.
echo ========================================
echo 3/5 - حذف مجلد android القديم
echo ========================================
if exist android (
  rmdir /s /q android
  echo تم حذف مجلد android.
) else (
  echo لا يوجد مجلد android سابق.
)

echo.
echo ========================================
echo 4/5 - إضافة Android: npx cap add android
echo ========================================
call npx cap add android
if errorlevel 1 goto failed

echo.
echo ========================================
echo 5/5 - مزامنة Android: npx cap sync android
echo ========================================
call npx cap sync android
if errorlevel 1 goto failed

echo.
echo ========================================
echo تم التجهيز بنجاح
echo ========================================
echo الآن افتح Android Studio بالأمر:
echo npx cap open android
echo.
set /p OPEN_STUDIO=هل تريد فتح Android Studio الآن؟ (y/n): 
if /i "%OPEN_STUDIO%"=="y" call npx cap open android
pause
exit /b 0

:failed
echo.
echo ========================================
echo فشل تنفيذ إحدى الخطوات. راجع الرسالة أعلاه.
echo ========================================
pause
exit /b 1