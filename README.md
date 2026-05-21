# 🏆 Mundial 2026 - Aplicación de Apuestas con IA

Una aplicación web full-stack para predecir y apostar en los partidos de la Copa Mundial de la FIFA 2026, impulsada por Inteligencia Artificial (Google Gemini).

## 🚀 Tecnologías Utilizadas

- **Frontend:** HTML5, CSS3 (Vanilla, variables CSS, glassmorphism), JavaScript (Vanilla, Fetch API).
- **Backend:** Node.js, Express.js.
- **Base de Datos:** MySQL (mysql2).
- **Autenticación:** JSON Web Tokens (JWT) y bcryptjs.
- **Inteligencia Artificial:** Google Gemini API (`@google/genai`).

---

## 💻 Instalación y Configuración (Para Desarrolladores)

### Requisitos Previos
1. [Node.js](https://nodejs.org/) instalado (v18 o superior).
2. [MySQL Workbench 8.0](https://dev.mysql.com/downloads/workbench/) instalado y ejecutándose en `127.0.0.1:3306`.
3. Usuario MySQL configurado como `root` sin contraseña (o ajusta el `.env`).

### Paso 1: Base de Datos
1. Abre MySQL Workbench.
2. Abre el archivo `database/init.sql` incluido en el proyecto.
3. Ejecuta todo el script para crear la base de datos `worldcup_betting` y los datos de prueba.

### Paso 2: Backend
1. Abre una terminal en la carpeta principal del proyecto.
2. Instala las dependencias ejecutando:
   ```bash
   npm install
   ```
3. Copia el archivo `.env.example` y renómbralo a `.env`.
   - Agrega tu clave de API de Gemini en `GEMINI_API_KEY`. (Si no la agregas, la IA devolverá predicciones mockeadas).
4. Inicia el servidor:
   ```bash
   npm start
   ```
   *El servidor correrá en `http://localhost:3000` y servirá el frontend automáticamente.*

### Paso 3: Frontend
Abre tu navegador y visita: `http://localhost:3000`.

---

## 🤝 Guía de Colaboración (Para los 3 Integrantes)

Para mantener el código limpio y organizado, seguiremos el flujo de trabajo de **Feature Branch Workflow** en GitHub.

### 1. Preparación Inicial del Repositorio
El líder del equipo debe:
1. Crear un repositorio en GitHub.
2. Subir este código inicial a la rama `main`.
3. Invitar a los otros 2 integrantes como colaboradores en las opciones del repositorio de GitHub.

Cada integrante debe clonar el repositorio localmente:
```bash
git clone <URL_DEL_REPOSITORIO>
cd CasaApuestasPW
```

### 2. Flujo de Trabajo (Para cada nueva tarea)

**NUNCA trabajen directamente en la rama `main`.**

1. **Actualiza tu rama main local:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Crea una rama para tu tarea específica:**
   Usa un nombre descriptivo (ej: `feat/login-ui`, `fix/db-connection`, `docs/update-readme`).
   ```bash
   git checkout -b feat/nombre-de-tu-tarea
   ```

3. **Haz tus cambios y realiza commits regulares:**
   ```bash
   git add .
   git commit -m "Descripción clara de lo que agregaste"
   ```

4. **Sube tu rama a GitHub:**
   ```bash
   git push origin feat/nombre-de-tu-tarea
   ```

5. **Crea un Pull Request (PR):**
   - Ve a GitHub y haz clic en "Compare & pull request".
   - Pide a uno de los otros **2 integrantes** que revise tu código (Code Review).
   - Una vez aprobado, el revisor puede hacer el "Merge" (fusionar) a la rama `main`.

6. **Vuelve al paso 1 para tu siguiente tarea.**

### 3. Reglas de la Dinámica del Equipo
- **Comunicación:** Avisen en su grupo de chat en qué archivo van a trabajar para evitar "Merge Conflicts" (Conflictos de fusión).
- Si modifican `package.json` (instalando nuevas librerías), avisen a los demás para que ejecuten `npm install` tras hacer pull.
- Si modifican la base de datos (nuevas tablas), actualicen `database/init.sql` e informen al equipo para que lo vuelvan a ejecutar.
