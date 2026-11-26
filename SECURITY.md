# Politica de seguridad

## Reportar una vulnerabilidad

No publiques vulnerabilidades en Issues publicos.

1. Usa **Security > Report a vulnerability** en este repositorio (si esta habilitado), o
2. Contacta directamente al owner del repositorio, `@copanicaballito-blip`.

## Reglas del proyecto

- Ninguna clave, token o contrasena se sube al repositorio. Usar `.env` (ignorado) y los
  secretos de GitHub Actions.
- Las variables `EXPO_PUBLIC_*` quedan visibles dentro de la app: nunca incluir secretos de servidor.
- Los datos del negocio (stock, ventas, empleados) se protegen con Row Level Security en la base de datos.
