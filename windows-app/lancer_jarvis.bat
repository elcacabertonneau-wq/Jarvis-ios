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

echo  Installation des dependances principales...
pip install customtkinter requests Pillow pyttsx3 SpeechRecognition sounddevice numpy pygame opencv-python --quiet

echo  Installation de PyAudio (microphone)...
pip install pyaudio --quiet 2>nul
if errorlevel 1 (
    echo  [INFO] PyAudio n'a pas pu s'installer directement.
    echo  Tentative via pipwin...
    pip install pipwin --quiet
    pipwin install pyaudio --quiet 2>nul
    if errorlevel 1 (
        echo  [AVERTISSEMENT] PyAudio non installe - la reconnaissance vocale sera desactivee.
        echo  Pour l'activer manuellement : pip install pyaudio
    )
)

echo.
echo  Lancement de JARVIS...
echo.
python jarvis.py

if errorlevel 1 (
    echo.
    echo  [ERREUR] JARVIS n'a pas pu demarrer.
    echo  Verifiez que Python est bien installe.
    pause
)
