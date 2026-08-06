@echo off
set PYTHON=C:\Users\paulo\AppData\Local\Programs\Python\Python313\python.exe
cd /d "%~dp0"
if not exist "data\painel.db" "%PYTHON%" import_xlsx.py
echo.
echo Iniciando painel Casa do Trabalhador...
echo Banco: data\painel.db (ou Supabase se DATABASE_URL estiver definida)
echo Abra no navegador: http://127.0.0.1:8765
echo.
"%PYTHON%" server.py
pause
