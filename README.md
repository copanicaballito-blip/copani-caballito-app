# Copani Caballito App

App móvil **interna** (Android e iOS) para la gestión del negocio Copani Caballito.
Uso exclusivo del equipo. Módulos previstos (a definir): stock, ventas, caja y empleados.

## Stack

| Capa | Tecnología | Referencia |
|---|---|---|
| App móvil | Expo (React Native) + TypeScript | [docs.expo.dev](https://docs.expo.dev/) |
| Backend / base de datos / login | Supabase (Postgres + Auth + Row Level Security) | [supabase.com/docs](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native) |
| Builds y publicación | EAS Build / EAS Submit | [docs.expo.dev/build](https://docs.expo.dev/build/introduction/) |
| CI | GitHub Actions | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

## Estado

Repositorio recién creado. Aún no existe el proyecto Expo.

## Puesta en marcha (cuando exista el proyecto)

```bash
npm ci
cp .env.example .env   # completar con los datos de Supabase
npx expo start
```

## Flujo de trabajo

1. Crear una rama desde `main` (`feature/...`, `fix/...`, `chore/...`).
2. Abrir un Pull Request hacia `main`.
3. Debe pasar el CI y ser revisado por el owner ([CODEOWNERS](.github/CODEOWNERS)).
4. Se fusiona a `main`.

## Seguridad

Ver [SECURITY.md](SECURITY.md). Nunca subir claves ni archivos `.env`.

## Pendientes tras crear el proyecto Expo

- Fusionar el `.gitignore` generado por `create-expo-app` con el de este repo.
- Agregar el ecosistema `npm` a `.github/dependabot.yml`.
- Confirmar la versión de Node del CI según el SDK de Expo elegido.
