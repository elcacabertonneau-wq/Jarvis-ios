@echo off
title JARVIS - Installation et lancement
color 0B

echo.
echo  ================================================
echo   J.A.R.V.I.S - Demarrage
echo  ================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] Python n'est pas installe.
    echo  Telechargez-le sur https://www.python.org/downloads/
    echo  Cochez bien "Add Python to PATH" lors de l'installation.
    pause
    exit /b 1
)

echo  Installation des dependances...
pip install customtkinter requests --quiet

echo  Lancement de JARVIS...
echo.
python jarvis.py

if errorlevel 1 (
    echo.
    echo  [ERREUR] JARVIS n'a pas pu demarrer.
    echo  Verifiez que Python est bien installe.
    pause
)
