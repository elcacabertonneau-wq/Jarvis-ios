import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import threading
import requests
import json
import os
import datetime
import sys
import time

try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

try:
    import speech_recognition as sr
    STT_AVAILABLE = True
except ImportError:
    STT_AVAILABLE = False

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

CYAN       = "#00D4FF"
CYAN_DIM   = "#00677F"
CYAN_DARK  = "#003344"
BG         = "#020810"
BG_PANEL   = "#050F1A"
BG_MSG     = "#071520"
WHITE      = "#E8F4FF"
WHITE_DIM  = "#6A8FA8"
GREEN      = "#00FF88"
ORANGE     = "#FF8C00"


class JarvisApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("J.A.R.V.I.S")
        self.geometry("960x720")
        self.minsize(700, 520)
        self.configure(fg_color=BG)

        # ── État ──────────────────────────────────────────
        self.api_key    = tk.StringVar(value=self._load_api_key())
        self.provider   = tk.StringVar(value=self._load_setting("provider", "claude"))
        self.messages   = []
        self.streaming  = False
        self.speaking   = False
        self.tts_engine = None
        self.recognizer = None

        if TTS_AVAILABLE:
            try:
                self.tts_engine = pyttsx3.init()
                self.tts_engine.setProperty("rate", 165)
                self.tts_engine.setProperty("volume", 0.9)
            except Exception:
                self.tts_engine = None

        if STT_AVAILABLE:
            try:
                self.recognizer = sr.Recognizer()
            except Exception:
                self.recognizer = None

        self._build_ui()
        self._update_clock()

    # ── Construction UI ───────────────────────────────────

    def _build_ui(self):
        self.grid_rowconfigure(0, weight=0)
        self.grid_rowconfigure(1, weight=1)
        self.grid_rowconfigure(2, weight=0)
        self.grid_columnconfigure(0, weight=1)

        self._build_header()
        self._build_chat()
        self._build_input()
        self._build_settings_panel()

    def _build_header(self):
        hdr = ctk.CTkFrame(self, fg_color=BG_PANEL, corner_radius=0, height=64)
        hdr.grid(row=0, column=0, sticky="ew")
        hdr.grid_propagate(False)
        hdr.grid_columnconfigure(1, weight=1)

        # Logo
        logo = ctk.CTkLabel(hdr, text="J.A.R.V.I.S",
                             font=ctk.CTkFont("Courier New", 22, "bold"),
                             text_color=CYAN)
        logo.grid(row=0, column=0, padx=20, pady=8, sticky="w")

        sub = ctk.CTkLabel(hdr, text="JUST A RATHER VERY INTELLIGENT SYSTEM",
                           font=ctk.CTkFont("Courier New", 8),
                           text_color=CYAN_DIM)
        sub.grid(row=1, column=0, padx=22, pady=0, sticky="w")

        # Horloge
        self.clock_lbl = ctk.CTkLabel(hdr, text="",
                                       font=ctk.CTkFont("Courier New", 18),
                                       text_color=CYAN)
        self.clock_lbl.grid(row=0, column=1, padx=10, pady=8)

        # Statut
        self.status_lbl = ctk.CTkLabel(hdr, text="● PRÊT",
                                        font=ctk.CTkFont("Courier New", 11),
                                        text_color=GREEN)
        self.status_lbl.grid(row=1, column=1, padx=10, pady=0)

        # Bouton settings
        ctk.CTkButton(hdr, text="⚙", width=36, height=36,
                      fg_color=CYAN_DARK, hover_color=CYAN_DIM, text_color=CYAN,
                      corner_radius=6, font=ctk.CTkFont(size=16),
                      command=self._toggle_settings).grid(row=0, column=2, rowspan=2, padx=12, pady=8)

        # Séparateur
        sep = ctk.CTkFrame(hdr, height=1, fg_color=CYAN_DIM)
        sep.grid(row=2, column=0, columnspan=3, sticky="ew")

    def _build_chat(self):
        chat_frame = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        chat_frame.grid(row=1, column=0, sticky="nsew")
        chat_frame.grid_rowconfigure(0, weight=1)
        chat_frame.grid_columnconfigure(0, weight=1)

        self.chat_box = ctk.CTkTextbox(
            chat_frame,
            fg_color=BG,
            text_color=WHITE,
            font=ctk.CTkFont("Courier New", 13),
            wrap="word",
            corner_radius=0,
            border_width=0,
            activate_scrollbars=True,
            state="disabled",
        )
        self.chat_box.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)

        self.chat_box.tag_config("user_name",   foreground=CYAN,     font=("Courier New", 11, "bold"))
        self.chat_box.tag_config("user_msg",    foreground=WHITE)
        self.chat_box.tag_config("jarvis_name", foreground=GREEN,    font=("Courier New", 11, "bold"))
        self.chat_box.tag_config("jarvis_msg",  foreground=WHITE_DIM)
        self.chat_box.tag_config("system_msg",  foreground=ORANGE,   font=("Courier New", 11, "italic"))
        self.chat_box.tag_config("separator",   foreground=CYAN_DIM)

        self._append_system("Systèmes en ligne. Bonjour, Monsieur. Comment puis-je vous assister ?")

    def _build_input(self):
        bar = ctk.CTkFrame(self, fg_color=BG_PANEL, corner_radius=0)
        bar.grid(row=2, column=0, sticky="ew")
        bar.grid_columnconfigure(1, weight=1)

        sep = ctk.CTkFrame(bar, height=1, fg_color=CYAN_DIM)
        sep.grid(row=0, column=0, columnspan=4, sticky="ew")

        # Bouton micro
        self.mic_btn = ctk.CTkButton(
            bar, text="🎤", width=44, height=44,
            fg_color=CYAN_DARK, hover_color=CYAN_DIM, text_color=CYAN,
            corner_radius=22, font=ctk.CTkFont(size=18),
            command=self._toggle_voice,
        )
        self.mic_btn.grid(row=1, column=0, padx=(12, 6), pady=10)
        if not STT_AVAILABLE or not self.recognizer:
            self.mic_btn.configure(state="disabled", text_color=WHITE_DIM)

        # Champ texte
        self.input_field = ctk.CTkEntry(
            bar,
            placeholder_text="Parlez ou écrivez à JARVIS...",
            placeholder_text_color=CYAN_DIM,
            fg_color=BG_MSG,
            text_color=WHITE,
            border_color=CYAN_DIM,
            border_width=1,
            corner_radius=22,
            font=ctk.CTkFont("Courier New", 13),
            height=44,
        )
        self.input_field.grid(row=1, column=1, sticky="ew", padx=6, pady=10)
        self.input_field.bind("<Return>", lambda e: self._send())

        # Bouton envoyer
        self.send_btn = ctk.CTkButton(
            bar, text="➤", width=44, height=44,
            fg_color=CYAN, hover_color=CYAN_DIM, text_color=BG,
            corner_radius=22, font=ctk.CTkFont(size=18, weight="bold"),
            command=self._send,
        )
        self.send_btn.grid(row=1, column=2, padx=(6, 12), pady=10)

    def _build_settings_panel(self):
        self.settings_frame = ctk.CTkFrame(self, fg_color=BG_PANEL, corner_radius=0, width=300)
        self.settings_frame.grid(row=0, column=1, rowspan=3, sticky="nsew", padx=0)
        self.settings_frame.grid_remove()
        self.settings_visible = False

        ctk.CTkLabel(self.settings_frame, text="PARAMÈTRES",
                     font=ctk.CTkFont("Courier New", 14, "bold"),
                     text_color=CYAN).pack(pady=(20, 4))

        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_DIM).pack(fill="x", padx=16, pady=8)

        # Provider
        ctk.CTkLabel(self.settings_frame, text="Fournisseur IA",
                     font=ctk.CTkFont("Courier New", 11), text_color=WHITE_DIM).pack(anchor="w", padx=16)
        ctk.CTkOptionMenu(
            self.settings_frame,
            values=["claude", "openai", "gemini"],
            variable=self.provider,
            fg_color=CYAN_DARK, button_color=CYAN_DIM,
            text_color=WHITE, font=ctk.CTkFont("Courier New", 12),
            command=lambda v: self._save_setting("provider", v),
        ).pack(fill="x", padx=16, pady=(4, 12))

        # API Key
        ctk.CTkLabel(self.settings_frame, text="Clé API",
                     font=ctk.CTkFont("Courier New", 11), text_color=WHITE_DIM).pack(anchor="w", padx=16)
        self.key_entry = ctk.CTkEntry(
            self.settings_frame,
            textvariable=self.api_key,
            show="•",
            fg_color=BG_MSG, text_color=WHITE,
            border_color=CYAN_DIM, border_width=1,
            font=ctk.CTkFont("Courier New", 11),
        )
        self.key_entry.pack(fill="x", padx=16, pady=(4, 4))

        ctk.CTkButton(
            self.settings_frame, text="Sauvegarder la clé",
            fg_color=CYAN_DARK, hover_color=CYAN_DIM, text_color=CYAN,
            font=ctk.CTkFont("Courier New", 11),
            command=self._save_api_key,
        ).pack(fill="x", padx=16, pady=(4, 16))

        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_DIM).pack(fill="x", padx=16, pady=4)

        # Voix
        ctk.CTkLabel(self.settings_frame, text="Réponses vocales",
                     font=ctk.CTkFont("Courier New", 11), text_color=WHITE_DIM).pack(anchor="w", padx=16, pady=(8, 0))
        self.voice_var = tk.BooleanVar(value=bool(self.tts_engine))
        ctk.CTkSwitch(
            self.settings_frame, text="", variable=self.voice_var,
            progress_color=CYAN, button_color=WHITE,
            onvalue=True, offvalue=False,
        ).pack(anchor="w", padx=16, pady=4)

        status_tts = "✓ Disponible" if TTS_AVAILABLE else "✗ Installer : pip install pyttsx3"
        status_stt = "✓ Disponible" if STT_AVAILABLE else "✗ Installer : pip install SpeechRecognition pyaudio"
        ctk.CTkLabel(self.settings_frame, text=f"Voix (TTS) : {status_tts}",
                     font=ctk.CTkFont("Courier New", 9), text_color=WHITE_DIM).pack(anchor="w", padx=16)
        ctk.CTkLabel(self.settings_frame, text=f"Micro (STT) : {status_stt}",
                     font=ctk.CTkFont("Courier New", 9), text_color=WHITE_DIM).pack(anchor="w", padx=16)

        ctk.CTkFrame(self.settings_frame, height=1, fg_color=CYAN_DIM).pack(fill="x", padx=16, pady=12)

        ctk.CTkButton(
            self.settings_frame, text="Effacer la conversation",
            fg_color="#1A0808", hover_color="#330000", text_color="#FF4444",
            font=ctk.CTkFont("Courier New", 11),
            command=self._clear_chat,
        ).pack(fill="x", padx=16, pady=4)

    # ── Actions ────────────────────────────────────────────

    def _send(self):
        text = self.input_field.get().strip()
        if not text or self.streaming:
            return
        self.input_field.delete(0, "end")
        self._append_user(text)
        self.messages.append({"role": "user", "content": text})
        threading.Thread(target=self._call_ai, daemon=True).start()

    def _call_ai(self):
        self.streaming = True
        self._set_status("● TRAITEMENT...", ORANGE)
        self.send_btn.configure(state="disabled")

        key = self.api_key.get().strip()
        if not key:
            self._append_system("⚠ Aucune clé API configurée. Ouvrez les Paramètres (⚙) et entrez votre clé.")
            self._done_streaming()
            return

        try:
            prov = self.provider.get()
            if prov == "claude":
                reply = self._call_claude(key)
            elif prov == "openai":
                reply = self._call_openai(key)
            elif prov == "gemini":
                reply = self._call_gemini(key)
            else:
                reply = "Fournisseur inconnu."

            self.messages.append({"role": "assistant", "content": reply})
            self.after(0, lambda: self._append_jarvis(reply))

            if self.voice_var.get() and self.tts_engine:
                threading.Thread(target=self._speak, args=(reply,), daemon=True).start()

        except requests.exceptions.ConnectionError:
            self.after(0, lambda: self._append_system("⚠ Erreur réseau. Vérifiez votre connexion."))
        except Exception as e:
            msg = str(e)
            self.after(0, lambda: self._append_system(f"⚠ Erreur : {msg}"))

        self._done_streaming()

    def _call_claude(self, key: str) -> str:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 1024,
                "system": (
                    "Tu es JARVIS, l'assistant IA d'Iron Man. "
                    "Tu es serviable, précis et poli. "
                    "Tu t'adresses à l'utilisateur comme à 'Monsieur'. "
                    "Réponds en français sauf si on te parle autrement. "
                    "Sois concis sauf si on te demande des détails."
                ),
                "messages": self.messages,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]

    def _call_openai(self, key: str) -> str:
        system = {
            "role": "system",
            "content": (
                "Tu es JARVIS, l'assistant IA d'Iron Man. "
                "Tu es serviable, précis et poli. "
                "Tu t'adresses à l'utilisateur comme à 'Monsieur'. "
                "Réponds en français sauf si on te parle autrement."
            ),
        }
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [system] + self.messages,
                "max_tokens": 1024,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def _call_gemini(self, key: str) -> str:
        contents = []
        for m in self.messages:
            role = "user" if m["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": contents,
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es JARVIS, l'assistant IA d'Iron Man. "
                        "Tu es serviable, précis et poli. "
                        "Tu t'adresses à l'utilisateur comme à 'Monsieur'. "
                        "Réponds en français sauf si on te parle autrement."
                    )}]
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    def _toggle_voice(self):
        if not STT_AVAILABLE or not self.recognizer:
            return
        threading.Thread(target=self._listen, daemon=True).start()

    def _listen(self):
        self.after(0, lambda: self.mic_btn.configure(fg_color=GREEN, text_color=BG))
        self._set_status("● ÉCOUTE...", GREEN)
        try:
            with sr.Microphone() as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio = self.recognizer.listen(source, timeout=5, phrase_time_limit=10)
            text = self.recognizer.recognize_google(audio, language="fr-FR")
            self.after(0, lambda: self.input_field.delete(0, "end"))
            self.after(0, lambda: self.input_field.insert(0, text))
            self.after(0, self._send)
        except sr.WaitTimeoutError:
            self.after(0, lambda: self._append_system("Aucune voix détectée."))
        except sr.UnknownValueError:
            self.after(0, lambda: self._append_system("Voix non comprise. Réessayez."))
        except Exception as e:
            self.after(0, lambda: self._append_system(f"Erreur micro : {e}"))
        finally:
            self.after(0, lambda: self.mic_btn.configure(fg_color=CYAN_DARK, text_color=CYAN))
            self._set_status("● PRÊT", GREEN)

    def _speak(self, text: str):
        if not self.tts_engine:
            return
        clean = text.replace("*", "").replace("#", "").replace("`", "")
        try:
            self.tts_engine.say(clean[:500])
            self.tts_engine.runAndWait()
        except Exception:
            pass

    # ── Affichage messages ─────────────────────────────────

    def _append_user(self, text: str):
        self.chat_box.configure(state="normal")
        now = datetime.datetime.now().strftime("%H:%M")
        self.chat_box.insert("end", f"\n[ VOUS  {now} ]\n", "user_name")
        self.chat_box.insert("end", f"{text}\n", "user_msg")
        self.chat_box.configure(state="disabled")
        self.chat_box.see("end")

    def _append_jarvis(self, text: str):
        self.chat_box.configure(state="normal")
        now = datetime.datetime.now().strftime("%H:%M")
        self.chat_box.insert("end", f"\n[ JARVIS {now} ]\n", "jarvis_name")
        self.chat_box.insert("end", f"{text}\n", "jarvis_msg")
        self.chat_box.insert("end", "─" * 60 + "\n", "separator")
        self.chat_box.configure(state="disabled")
        self.chat_box.see("end")

    def _append_system(self, text: str):
        self.chat_box.configure(state="normal")
        self.chat_box.insert("end", f"\n⬡ {text}\n", "system_msg")
        self.chat_box.configure(state="disabled")
        self.chat_box.see("end")

    def _clear_chat(self):
        self.messages = []
        self.chat_box.configure(state="normal")
        self.chat_box.delete("1.0", "end")
        self.chat_box.configure(state="disabled")
        self._append_system("Conversation effacée. Systèmes réinitialisés.")

    # ── Utilitaires ────────────────────────────────────────

    def _done_streaming(self):
        self.streaming = False
        self.after(0, lambda: self.send_btn.configure(state="normal"))
        self._set_status("● PRÊT", GREEN)

    def _set_status(self, text: str, color: str):
        self.after(0, lambda: self.status_lbl.configure(text=text, text_color=color))

    def _toggle_settings(self):
        if self.settings_visible:
            self.settings_frame.grid_remove()
            self.grid_columnconfigure(1, weight=0, minsize=0)
        else:
            self.settings_frame.grid(row=0, column=1, rowspan=3, sticky="nsew")
            self.grid_columnconfigure(1, weight=0, minsize=300)
        self.settings_visible = not self.settings_visible

    def _update_clock(self):
        now = datetime.datetime.now().strftime("%H:%M:%S")
        self.clock_lbl.configure(text=now)
        self.after(1000, self._update_clock)

    # ── Persistance ────────────────────────────────────────

    def _config_path(self) -> str:
        return os.path.join(os.path.expanduser("~"), ".jarvis_config.json")

    def _load_api_key(self) -> str:
        env = os.environ.get("ANTHROPIC_API_KEY", "")
        if env:
            return env
        try:
            with open(self._config_path()) as f:
                return json.load(f).get("api_key", "")
        except Exception:
            return ""

    def _load_setting(self, key: str, default: str) -> str:
        try:
            with open(self._config_path()) as f:
                return json.load(f).get(key, default)
        except Exception:
            return default

    def _save_api_key(self):
        self._save_setting("api_key", self.api_key.get().strip())
        self._append_system("✓ Clé API sauvegardée.")

    def _save_setting(self, key: str, value: str):
        cfg = {}
        try:
            with open(self._config_path()) as f:
                cfg = json.load(f)
        except Exception:
            pass
        cfg[key] = value
        with open(self._config_path(), "w") as f:
            json.dump(cfg, f)


if __name__ == "__main__":
    app = JarvisApp()
    app.mainloop()
