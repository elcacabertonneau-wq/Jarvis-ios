#!/usr/bin/env python3
"""J.A.R.V.I.S — Windows Edition — Iron Man AI Assistant"""
from __future__ import annotations
import customtkinter as ctk
import tkinter as tk
import threading, requests, json, os, datetime, sys, time

# ── Optional modules (app works without them, features disabled) ────────
try:
    from PIL import Image, ImageTk
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    import pyttsx3
    TTS_OK = True
except ImportError:
    TTS_OK = False

try:
    import speech_recognition as sr
    STT_OK = True
except ImportError:
    STT_OK = False

try:
    import sounddevice as sd
    import numpy as np
    CLAP_OK = True
except ImportError:
    CLAP_OK = False

try:
    import pygame
    pygame.mixer.pre_init(44100, -16, 2, 2048)
    pygame.mixer.init()
    MUSIC_OK = True
except ImportError:
    MUSIC_OK = False

try:
    import cv2
    FACE_OK = True
except ImportError:
    FACE_OK = False

# ── Theme ───────────────────────────────────────────────────────────────
ctk.set_appearance_mode("dark")

CYAN    = "#00D4FF"
CYAN_D  = "#00677F"
CYAN_DD = "#003344"
BG      = "#020810"
PANEL   = "#050F1A"
MSG_BG  = "#071520"
WHITE   = "#E8F4FF"
DIM     = "#6A8FA8"
GREEN   = "#00FF88"
ORANGE  = "#FF8C00"
RED     = "#FF3333"

APP_DIR  = os.path.dirname(os.path.abspath(sys.argv[0]))
MUSIC_FILE = os.path.join(APP_DIR, "welcome.mp3")
CFG_FILE   = os.path.join(os.path.expanduser("~"), ".jarvis_win.json")
FACE_FILE  = os.path.join(os.path.expanduser("~"), ".jarvis_face.npy")

SYSTEM_PROMPT = (
    "Tu es JARVIS, l'assistant IA d'Iron Man. Tu es serviable, précis et légèrement "
    "sarcastique avec de l'humour. Tu t'adresses toujours à l'utilisateur comme 'Monsieur'. "
    "Réponds en français sauf si on te parle dans une autre langue. "
    "Sois concis sauf si on te demande des détails."
)

# ── Config ──────────────────────────────────────────────────────────────
def load_cfg() -> dict:
    try:
        with open(CFG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_cfg(data: dict):
    try:
        existing = load_cfg()
        existing.update(data)
        with open(CFG_FILE, "w") as f:
            json.dump(existing, f, indent=2)
    except Exception:
        pass


# ── Music Player ────────────────────────────────────────────────────────
class MusicPlayer:
    def play_welcome(self):
        if MUSIC_OK and os.path.exists(MUSIC_FILE):
            try:
                pygame.mixer.music.load(MUSIC_FILE)
                pygame.mixer.music.set_volume(0.7)
                pygame.mixer.music.play()
                return
            except Exception:
                pass
        # Fallback: TTS greeting
        if TTS_OK:
            threading.Thread(target=self._tts_greet, daemon=True).start()

    def _tts_greet(self):
        try:
            e = pyttsx3.init()
            e.setProperty("rate", 155)
            e.say("Welcome back, sir. All systems are online.")
            e.runAndWait()
        except Exception:
            pass

    def stop(self):
        if MUSIC_OK:
            try:
                pygame.mixer.music.fadeout(1000)
            except Exception:
                pass


# ── Face Authentication ─────────────────────────────────────────────────
class FaceAuth:
    """Face lock using OpenCV Haar cascade + template matching."""

    def __init__(self):
        self._cascade = None
        if FACE_OK:
            xml = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            c = cv2.CascadeClassifier(xml)
            if not c.empty():
                self._cascade = c

    @property
    def available(self) -> bool:
        return FACE_OK and self._cascade is not None

    @property
    def enrolled(self) -> bool:
        return os.path.exists(FACE_FILE)

    def detect(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        return self._cascade.detectMultiScale(gray, 1.2, 5, minSize=(70, 70))

    def enroll(self, frame) -> bool:
        faces = self.detect(frame)
        if len(faces) == 0:
            return False
        x, y, w, h = faces[0]
        face = cv2.resize(cv2.cvtColor(frame[y:y+h, x:x+w], cv2.COLOR_BGR2GRAY), (100, 100))
        np.save(FACE_FILE, face.astype(np.float32))
        return True

    def authenticate(self, frame) -> tuple[bool, float]:
        if not self.enrolled:
            return False, 0.0
        ref = np.load(FACE_FILE).astype(np.uint8)
        for (x, y, w, h) in self.detect(frame):
            cur = cv2.resize(
                cv2.cvtColor(frame[y:y+h, x:x+w], cv2.COLOR_BGR2GRAY),
                (100, 100)
            ).astype(np.uint8)
            score = float(cv2.matchTemplate(cur, ref, cv2.TM_CCOEFF_NORMED)[0][0])
            if score > 0.38:
                return True, score
        return False, 0.0


# ── Clap Detector ───────────────────────────────────────────────────────
class ClapDetector:
    THRESHOLD   = 0.50
    WINDOW_SEC  = 1.4
    COOLDOWN    = 2.5

    def __init__(self, on_double_clap):
        self._cb      = on_double_clap
        self._times   = []
        self._last    = 0.0
        self._running = False

    def start(self):
        if not CLAP_OK:
            return
        self._running = True
        threading.Thread(target=self._run, daemon=True).start()

    def stop(self):
        self._running = False

    def _run(self):
        def _cb(indata, frames, t, status):
            vol = float(np.sqrt(np.mean(indata ** 2)))
            if vol > self.THRESHOLD:
                now = time.time()
                self._times = [ts for ts in self._times if now - ts < self.WINDOW_SEC]
                self._times.append(now)
                if len(self._times) >= 2 and now - self._last > self.COOLDOWN:
                    self._last  = now
                    self._times = []
                    self._cb()
        try:
            with sd.InputStream(callback=_cb, channels=1, samplerate=44100, blocksize=2048):
                while self._running:
                    time.sleep(0.05)
        except Exception:
            pass


# ── Voice Engine ────────────────────────────────────────────────────────
class VoiceEngine:
    def __init__(self):
        self._tts = None
        self._stt = sr.Recognizer() if STT_OK else None
        self._cont = False
        if TTS_OK:
            try:
                self._tts = pyttsx3.init()
                self._tts.setProperty("rate", 160)
                self._tts.setProperty("volume", 0.9)
            except Exception:
                self._tts = None

    def speak(self, text: str):
        if not self._tts:
            return
        clean = text.replace("*", "").replace("#", "").replace("`", "")[:600]
        threading.Thread(target=self._do_speak, args=(clean,), daemon=True).start()

    def _do_speak(self, text: str):
        try:
            self._tts.say(text)
            self._tts.runAndWait()
        except Exception:
            pass

    def listen_once(self, timeout=5) -> str | None:
        if not self._stt:
            return None
        try:
            with sr.Microphone() as src:
                self._stt.adjust_for_ambient_noise(src, 0.3)
                audio = self._stt.listen(src, timeout=timeout, phrase_time_limit=12)
            return self._stt.recognize_google(audio, language="fr-FR")
        except Exception:
            return None

    def start_continuous(self, on_text):
        self._cont = True
        threading.Thread(target=self._cont_loop, args=(on_text,), daemon=True).start()

    def stop_continuous(self):
        self._cont = False

    def _cont_loop(self, on_text):
        while self._cont:
            text = self.listen_once(timeout=3)
            if text and self._cont:
                on_text(text)
            time.sleep(0.05)


# ── AI Client ───────────────────────────────────────────────────────────
class AIClient:
    def call(self, provider: str, key: str, messages: list) -> str:
        if provider == "claude":
            return self._claude(key, messages)
        if provider == "openai":
            return self._openai(key, messages)
        if provider == "gemini":
            return self._gemini(key, messages)
        return "Fournisseur inconnu."

    def _claude(self, key, msgs):
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-sonnet-4-6", "max_tokens": 1024, "system": SYSTEM_PROMPT, "messages": msgs},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"]

    def _openai(self, key, msgs):
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": "gpt-4o-mini", "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + msgs, "max_tokens": 1024},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    def _gemini(self, key, msgs):
        contents = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
            for m in msgs
        ]
        r = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}",
            headers={"Content-Type": "application/json"},
            json={"contents": contents, "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]}},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]


# ── Main Application ────────────────────────────────────────────────────
class JarvisApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        # Subsystems
        cfg             = load_cfg()
        self.face       = FaceAuth()
        self.music      = MusicPlayer()
        self.voice      = VoiceEngine()
        self.ai         = AIClient()
        self.claps      = ClapDetector(self._on_double_clap)

        # State
        self.messages       = []
        self.streaming      = False
        self.continuous_mic = False
        self.cam            = None
        self.cam_active     = False
        self.enroll_mode    = False
        self.locked         = True

        # Settings vars
        self.api_key      = tk.StringVar(value=cfg.get("api_key", ""))
        self.provider     = tk.StringVar(value=cfg.get("provider", "claude"))
        self.voice_on     = tk.BooleanVar(value=bool(self.voice._tts))
        self.settings_vis = False

        # Window
        self.title("J.A.R.V.I.S")
        self.geometry("1020x740")
        self.minsize(780, 540)
        self.configure(fg_color=BG)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._build_ui()
        self.claps.start()
        self._update_clock()

        # Start face lock or go straight to chat
        if self.face.available:
            self._show_lock_screen()
        else:
            self._unlock()

    # ── UI Construction ────────────────────────────────────────────────

    def _build_ui(self):
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self._build_header()
        self._build_chat_area()
        self._build_input_bar()
        self._build_settings_panel()
        self._build_lock_screen()

    def _build_header(self):
        hdr = ctk.CTkFrame(self, fg_color=PANEL, corner_radius=0, height=66)
        hdr.grid(row=0, column=0, columnspan=2, sticky="ew")
        hdr.grid_propagate(False)
        hdr.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(hdr, text="J.A.R.V.I.S",
                     font=ctk.CTkFont("Courier New", 22, "bold"),
                     text_color=CYAN).grid(row=0, column=0, padx=20, pady=(10, 0), sticky="w")
        ctk.CTkLabel(hdr, text="JUST A RATHER VERY INTELLIGENT SYSTEM",
                     font=ctk.CTkFont("Courier New", 8),
                     text_color=CYAN_D).grid(row=1, column=0, padx=22, sticky="w")

        self.clock_lbl = ctk.CTkLabel(hdr, text="",
                                       font=ctk.CTkFont("Courier New", 20),
                                       text_color=CYAN)
        self.clock_lbl.grid(row=0, column=1, pady=(10, 0))

        self.status_lbl = ctk.CTkLabel(hdr, text="● EN LIGNE",
                                        font=ctk.CTkFont("Courier New", 11),
                                        text_color=GREEN)
        self.status_lbl.grid(row=1, column=1)

        btn_frame = ctk.CTkFrame(hdr, fg_color="transparent")
        btn_frame.grid(row=0, column=2, rowspan=2, padx=12)

        # Mic always-on toggle
        self.mic_toggle_btn = ctk.CTkButton(
            btn_frame, text="🎙", width=36, height=36,
            fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
            corner_radius=6, font=ctk.CTkFont(size=16),
            command=self._toggle_continuous_mic,
        )
        self.mic_toggle_btn.pack(side="left", padx=4)
        if not STT_OK:
            self.mic_toggle_btn.configure(state="disabled", text_color=DIM)

        # Face lock button
        self.lock_btn = ctk.CTkButton(
            btn_frame, text="🔒", width=36, height=36,
            fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
            corner_radius=6, font=ctk.CTkFont(size=16),
            command=self._manual_lock,
        )
        self.lock_btn.pack(side="left", padx=4)
        if not self.face.available:
            self.lock_btn.configure(state="disabled", text_color=DIM)

        ctk.CTkButton(
            btn_frame, text="⚙", width=36, height=36,
            fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
            corner_radius=6, font=ctk.CTkFont(size=16),
            command=self._toggle_settings,
        ).pack(side="left", padx=4)

        ctk.CTkFrame(hdr, height=1, fg_color=CYAN_D).grid(row=2, column=0, columnspan=3, sticky="ew")

    def _build_chat_area(self):
        self.chat_box = ctk.CTkTextbox(
            self, fg_color=BG, text_color=WHITE,
            font=ctk.CTkFont("Courier New", 13),
            wrap="word", corner_radius=0, border_width=0,
            state="disabled",
        )
        self.chat_box.grid(row=1, column=0, sticky="nsew")
        self.chat_box.tag_config("you",     foreground=CYAN,  font=("Courier New", 11, "bold"))
        self.chat_box.tag_config("jarvis",  foreground=GREEN, font=("Courier New", 11, "bold"))
        self.chat_box.tag_config("msg_you", foreground=WHITE)
        self.chat_box.tag_config("msg_ai",  foreground=DIM)
        self.chat_box.tag_config("system",  foreground=ORANGE, font=("Courier New", 11, "italic"))
        self.chat_box.tag_config("sep",     foreground=CYAN_DD)

        self._sys_msg("Systèmes en ligne. Bonjour, Monsieur. Comment puis-je vous assister ?")

    def _build_input_bar(self):
        bar = ctk.CTkFrame(self, fg_color=PANEL, corner_radius=0)
        bar.grid(row=2, column=0, sticky="ew")
        bar.grid_columnconfigure(1, weight=1)

        ctk.CTkFrame(bar, height=1, fg_color=CYAN_D).grid(row=0, column=0, columnspan=4, sticky="ew")

        # Voice button (single press)
        self.mic_btn = ctk.CTkButton(
            bar, text="🎤", width=44, height=44,
            fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
            corner_radius=22, font=ctk.CTkFont(size=18),
            command=self._listen_once,
        )
        self.mic_btn.grid(row=1, column=0, padx=(12, 6), pady=10)
        if not STT_OK:
            self.mic_btn.configure(state="disabled", text_color=DIM)

        self.input_field = ctk.CTkEntry(
            bar,
            placeholder_text="Parlez ou écrivez à JARVIS...",
            placeholder_text_color=CYAN_D,
            fg_color=MSG_BG, text_color=WHITE,
            border_color=CYAN_D, border_width=1,
            corner_radius=22,
            font=ctk.CTkFont("Courier New", 13),
            height=44,
        )
        self.input_field.grid(row=1, column=1, sticky="ew", padx=6, pady=10)
        self.input_field.bind("<Return>", lambda e: self._send())

        self.send_btn = ctk.CTkButton(
            bar, text="➤", width=44, height=44,
            fg_color=CYAN, hover_color=CYAN_D, text_color=BG,
            corner_radius=22, font=ctk.CTkFont(size=18, weight="bold"),
            command=self._send,
        )
        self.send_btn.grid(row=1, column=2, padx=(6, 12), pady=10)

    def _build_settings_panel(self):
        self.settings_frame = ctk.CTkScrollableFrame(
            self, fg_color=PANEL, corner_radius=0, width=290
        )
        self.settings_frame.grid(row=0, column=1, rowspan=3, sticky="nsew")
        self.settings_frame.grid_remove()

        ctk.CTkLabel(self.settings_frame, text="PARAMÈTRES",
                     font=ctk.CTkFont("Courier New", 14, "bold"), text_color=CYAN).pack(pady=(16, 4))
        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_D).pack(fill="x", padx=16, pady=6)

        # Provider
        ctk.CTkLabel(self.settings_frame, text="Fournisseur IA",
                     font=ctk.CTkFont("Courier New", 11), text_color=DIM).pack(anchor="w", padx=16)
        ctk.CTkOptionMenu(
            self.settings_frame, values=["claude", "openai", "gemini"],
            variable=self.provider, fg_color=CYAN_DD, button_color=CYAN_D,
            text_color=WHITE, font=ctk.CTkFont("Courier New", 12),
            command=lambda v: save_cfg({"provider": v}),
        ).pack(fill="x", padx=16, pady=(4, 12))

        # API Key
        ctk.CTkLabel(self.settings_frame, text="Clé API",
                     font=ctk.CTkFont("Courier New", 11), text_color=DIM).pack(anchor="w", padx=16)
        ctk.CTkEntry(
            self.settings_frame, textvariable=self.api_key, show="•",
            fg_color=MSG_BG, text_color=WHITE, border_color=CYAN_D, border_width=1,
            font=ctk.CTkFont("Courier New", 11),
        ).pack(fill="x", padx=16, pady=(4, 4))
        ctk.CTkButton(
            self.settings_frame, text="Sauvegarder la clé",
            fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
            font=ctk.CTkFont("Courier New", 11),
            command=lambda: (save_cfg({"api_key": self.api_key.get().strip()}),
                             self._sys_msg("✓ Clé API sauvegardée.")),
        ).pack(fill="x", padx=16, pady=(4, 12))

        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_D).pack(fill="x", padx=16, pady=4)

        # Voice output
        ctk.CTkLabel(self.settings_frame, text="Réponses vocales",
                     font=ctk.CTkFont("Courier New", 11), text_color=DIM).pack(anchor="w", padx=16, pady=(8, 0))
        ctk.CTkSwitch(
            self.settings_frame, text="", variable=self.voice_on,
            progress_color=CYAN, button_color=WHITE,
        ).pack(anchor="w", padx=16, pady=4)

        # Face enrollment
        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_D).pack(fill="x", padx=16, pady=8)
        ctk.CTkLabel(self.settings_frame, text="Face ID",
                     font=ctk.CTkFont("Courier New", 11), text_color=DIM).pack(anchor="w", padx=16)
        face_status = "✓ OpenCV disponible" if self.face.available else "✗ pip install opencv-python"
        enrolled_status = " (visage enregistré)" if self.face.enrolled else " (non enregistré)"
        ctk.CTkLabel(self.settings_frame, text=face_status + enrolled_status,
                     font=ctk.CTkFont("Courier New", 9), text_color=DIM).pack(anchor="w", padx=16)
        if self.face.available:
            ctk.CTkButton(
                self.settings_frame, text="Réenregistrer mon visage",
                fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
                font=ctk.CTkFont("Courier New", 11),
                command=self._reenroll_face,
            ).pack(fill="x", padx=16, pady=(6, 4))

        # Status
        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_D).pack(fill="x", padx=16, pady=8)
        tts_s  = "✓ pyttsx3"        if TTS_OK   else "✗ pip install pyttsx3"
        stt_s  = "✓ SpeechRecognition" if STT_OK else "✗ pip install SpeechRecognition pyaudio"
        clap_s = "✓ sounddevice"    if CLAP_OK  else "✗ pip install sounddevice numpy"
        mus_s  = "✓ pygame"         if MUSIC_OK else "✗ pip install pygame"
        for label in [f"Voix : {tts_s}", f"Micro : {stt_s}", f"Clap : {clap_s}", f"Musique : {mus_s}"]:
            ctk.CTkLabel(self.settings_frame, text=label,
                         font=ctk.CTkFont("Courier New", 9), text_color=DIM).pack(anchor="w", padx=16, pady=1)

        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_D).pack(fill="x", padx=16, pady=8)
        ctk.CTkButton(
            self.settings_frame, text="Effacer la conversation",
            fg_color="#1A0808", hover_color="#330000", text_color="#FF5555",
            font=ctk.CTkFont("Courier New", 11), command=self._clear_chat,
        ).pack(fill="x", padx=16, pady=4)

    def _build_lock_screen(self):
        self.lock_frame = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self.lock_frame.grid(row=0, column=0, rowspan=3, sticky="nsew")
        self.lock_frame.grid_columnconfigure(0, weight=1)
        self.lock_frame.grid_rowconfigure(0, weight=1)

        inner = ctk.CTkFrame(self.lock_frame, fg_color="transparent")
        inner.grid(row=0, column=0)

        ctk.CTkLabel(inner, text="J.A.R.V.I.S",
                     font=ctk.CTkFont("Courier New", 36, "bold"), text_color=CYAN).pack(pady=(0, 4))
        ctk.CTkLabel(inner, text="IDENTIFICATION REQUISE",
                     font=ctk.CTkFont("Courier New", 12), text_color=CYAN_D).pack(pady=(0, 20))

        # Camera feed
        self.cam_label = tk.Label(inner, bg="#010508", width=320, height=240)
        self.cam_label.pack(pady=(0, 16))

        self.lock_status = ctk.CTkLabel(inner, text="⟳ SCAN EN COURS...",
                                         font=ctk.CTkFont("Courier New", 13), text_color=CYAN)
        self.lock_status.pack(pady=(0, 12))

        self.enroll_btn = ctk.CTkButton(
            inner, text="📸  Enregistrer mon visage",
            fg_color=CYAN_DD, hover_color=CYAN_D, text_color=CYAN,
            font=ctk.CTkFont("Courier New", 12), width=260, height=40,
            command=self._do_enroll,
        )
        self.enroll_btn.pack(pady=4)
        self.enroll_btn.pack_forget()  # hidden until needed

        ctk.CTkButton(
            inner, text="Ignorer (pas de caméra)",
            fg_color="transparent", hover_color=CYAN_DD, text_color=DIM,
            font=ctk.CTkFont("Courier New", 10),
            command=self._unlock,
        ).pack(pady=(8, 0))

        self.lock_frame.grid_remove()

    # ── Lock Screen Logic ───────────────────────────────────────────────

    def _show_lock_screen(self):
        self.locked = True
        self.lock_frame.grid(row=0, column=0, rowspan=3, sticky="nsew")
        self.lock_frame.lift()
        self._start_camera()

    def _start_camera(self):
        if not FACE_OK:
            return
        self.cam = cv2.VideoCapture(0)
        if not self.cam.isOpened():
            self.lock_status.configure(text="⚠ Caméra indisponible", text_color=ORANGE)
            self.enroll_btn.pack(pady=4)
            return
        self.cam_active = True
        self.enroll_btn.pack_forget()
        if not self.face.enrolled:
            self.lock_status.configure(text="Aucun visage enregistré — appuyez sur le bouton", text_color=ORANGE)
            self.enroll_btn.pack(pady=4)
        else:
            self.lock_status.configure(text="⟳ IDENTIFICATION...", text_color=CYAN)
        self._cam_loop()

    def _cam_loop(self):
        if not self.cam_active or self.cam is None:
            return
        ret, frame = self.cam.read()
        if ret and PIL_OK:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(cv2.resize(rgb, (320, 240)))
            tk_img = ImageTk.PhotoImage(img)
            self.cam_label.configure(image=tk_img)
            self.cam_label.image = tk_img

            if self.face.enrolled and not self.enroll_mode:
                ok, score = self.face.authenticate(frame)
                if ok:
                    self.lock_status.configure(text=f"✓ AUTORISÉ ({score:.0%})", text_color=GREEN)
                    self.after(600, self._unlock)
                    return

        if not self.locked:
            return
        self.after(50, self._cam_loop)

    def _do_enroll(self):
        if not self.cam or not self.cam.isOpened():
            return
        self.enroll_mode = True
        self.lock_status.configure(text="Restez face à la caméra...", text_color=ORANGE)
        self.after(1500, self._capture_enroll)

    def _capture_enroll(self):
        ret, frame = self.cam.read()
        if ret and self.face.enroll(frame):
            self.lock_status.configure(text="✓ Visage enregistré ! Identification...", text_color=GREEN)
            self.enroll_btn.pack_forget()
        else:
            self.lock_status.configure(text="⚠ Aucun visage détecté. Réessayez.", text_color=ORANGE)
        self.enroll_mode = False

    def _reenroll_face(self):
        if os.path.exists(FACE_FILE):
            os.remove(FACE_FILE)
        self._toggle_settings()
        self._show_lock_screen()

    def _unlock(self, play_music: bool = True):
        self.locked = False
        self.cam_active = False
        if self.cam:
            self.cam.release()
            self.cam = None
        self.lock_frame.grid_remove()
        if play_music:
            self.music.play_welcome()
        self._set_status("● EN LIGNE", GREEN)

    def _manual_lock(self):
        self.music.stop()
        if self.continuous_mic:
            self._toggle_continuous_mic()
        self._show_lock_screen()

    # ── Chat & AI ───────────────────────────────────────────────────────

    def _send(self, text: str = ""):
        if not text:
            text = self.input_field.get().strip()
        if not text or self.streaming:
            return
        self.input_field.delete(0, "end")
        self._add_you(text)
        self.messages.append({"role": "user", "content": text})
        threading.Thread(target=self._call_ai, daemon=True).start()

    def _call_ai(self):
        self.streaming = True
        self._set_status("● TRAITEMENT...", ORANGE)
        self.send_btn.configure(state="disabled")
        key = self.api_key.get().strip()
        if not key:
            self._sys_msg("⚠ Aucune clé API. Ouvrez ⚙ et entrez votre clé.")
            self._done()
            return
        try:
            reply = self.ai.call(self.provider.get(), key, self.messages)
            self.messages.append({"role": "assistant", "content": reply})
            self.after(0, lambda: self._add_jarvis(reply))
            if self.voice_on.get():
                self.voice.speak(reply)
        except requests.exceptions.ConnectionError:
            self.after(0, lambda: self._sys_msg("⚠ Erreur réseau."))
        except requests.exceptions.HTTPError as e:
            self.after(0, lambda: self._sys_msg(f"⚠ Erreur API {e.response.status_code} — vérifiez votre clé."))
        except Exception as e:
            msg = str(e)
            self.after(0, lambda: self._sys_msg(f"⚠ {msg}"))
        self._done()

    def _done(self):
        self.streaming = False
        self.after(0, lambda: self.send_btn.configure(state="normal"))
        self._set_status("● EN LIGNE", GREEN)

    # ── Microphone ──────────────────────────────────────────────────────

    def _listen_once(self):
        if not STT_OK:
            return
        threading.Thread(target=self._do_listen_once, daemon=True).start()

    def _do_listen_once(self):
        self.after(0, lambda: self.mic_btn.configure(fg_color=GREEN, text_color=BG))
        self._set_status("● ÉCOUTE...", GREEN)
        text = self.voice.listen_once(timeout=6)
        self.after(0, lambda: self.mic_btn.configure(fg_color=CYAN_DD, text_color=CYAN))
        if text:
            self.after(0, lambda: self._send(text))
        else:
            self._set_status("● EN LIGNE", GREEN)

    def _toggle_continuous_mic(self):
        if not STT_OK:
            return
        self.continuous_mic = not self.continuous_mic
        if self.continuous_mic:
            self.mic_toggle_btn.configure(fg_color=GREEN, text_color=BG, text="🎙")
            self._set_status("● ÉCOUTE CONTINUE", GREEN)
            self.voice.start_continuous(lambda t: self.after(0, lambda: self._send(t)))
        else:
            self.mic_toggle_btn.configure(fg_color=CYAN_DD, text_color=CYAN, text="🎙")
            self._set_status("● EN LIGNE", GREEN)
            self.voice.stop_continuous()

    # ── Chat display ────────────────────────────────────────────────────

    def _add_you(self, text: str):
        now = datetime.datetime.now().strftime("%H:%M")
        self.chat_box.configure(state="normal")
        self.chat_box.insert("end", f"\n[ VOUS {now} ]\n", "you")
        self.chat_box.insert("end", f"{text}\n", "msg_you")
        self.chat_box.configure(state="disabled")
        self.chat_box.see("end")

    def _add_jarvis(self, text: str):
        now = datetime.datetime.now().strftime("%H:%M")
        self.chat_box.configure(state="normal")
        self.chat_box.insert("end", f"\n[ JARVIS {now} ]\n", "jarvis")
        self.chat_box.insert("end", f"{text}\n", "msg_ai")
        self.chat_box.insert("end", "─" * 58 + "\n", "sep")
        self.chat_box.configure(state="disabled")
        self.chat_box.see("end")

    def _sys_msg(self, text: str):
        self.chat_box.configure(state="normal")
        self.chat_box.insert("end", f"\n⬡ {text}\n", "system")
        self.chat_box.configure(state="disabled")
        self.chat_box.see("end")

    def _clear_chat(self):
        self.messages = []
        self.chat_box.configure(state="normal")
        self.chat_box.delete("1.0", "end")
        self.chat_box.configure(state="disabled")
        self._sys_msg("Conversation effacée. Systèmes réinitialisés, Monsieur.")

    # ── Utilities ───────────────────────────────────────────────────────

    def _on_double_clap(self):
        self.after(0, self._raise_window)

    def _raise_window(self):
        self.deiconify()
        self.lift()
        self.focus_force()
        self._sys_msg("⬡ Double clap détecté — JARVIS est à votre service, Monsieur.")

    def _toggle_settings(self):
        if self.settings_vis:
            self.settings_frame.grid_remove()
            self.grid_columnconfigure(1, weight=0, minsize=0)
        else:
            self.settings_frame.grid(row=0, column=1, rowspan=3, sticky="nsew")
            self.grid_columnconfigure(1, weight=0, minsize=290)
        self.settings_vis = not self.settings_vis

    def _set_status(self, text: str, color: str):
        self.after(0, lambda: self.status_lbl.configure(text=text, text_color=color))

    def _update_clock(self):
        self.clock_lbl.configure(text=datetime.datetime.now().strftime("%H:%M:%S"))
        self.after(1000, self._update_clock)

    def _on_close(self):
        self.cam_active = False
        self.claps.stop()
        self.voice.stop_continuous()
        if self.cam:
            self.cam.release()
        self.destroy()


# ── Entry point ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = JarvisApp()
    app.mainloop()
