# ChileCity RP — Deploy en Vercel

## Estructura
```
chilecity-rp/
├── api/
│   ├── login.js       ← redirige a Discord OAuth2
│   └── callback.js    ← recibe el código y obtiene datos del usuario
├── public/
│   └── index.html     ← frontend completo
└── vercel.json        ← config de rutas
```

## Pasos para deployar

### 1. Subir a GitHub
Crea un repo nuevo en github.com y sube esta carpeta.

### 2. Importar en Vercel
- Ve a vercel.com → "Add New Project"
- Conecta tu repo de GitHub
- Click en "Deploy" (sin cambiar nada)

### 3. Configurar variables de entorno en Vercel
En tu proyecto en Vercel → Settings → Environment Variables, agrega:

| Nombre | Valor |
|--------|-------|
| DISCORD_CLIENT_ID | Tu Client ID de Discord |
| DISCORD_CLIENT_SECRET | Tu Client Secret de Discord |
| DISCORD_REDIRECT_URI | https://TU-DOMINIO.vercel.app/auth/callback |

### 4. Agregar Redirect URI en Discord
En discord.com/developers → tu app → OAuth2 → Redirects:
Agrega: https://TU-DOMINIO.vercel.app/auth/callback

### 5. Re-deploy
Después de agregar las variables, ve a Deployments → redeploy.

## Personalización
- `public/index.html` → cambia textos, colores, links de los botones, logo, video
- Los 5 botones están en la sección `.nav-grid` — cambia `href`, icono emoji y título
