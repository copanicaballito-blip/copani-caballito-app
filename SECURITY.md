# Política de seguridad

## Reportar una vulnerabilidad

No publiques vulnerabilidades en Issues públicos. Contactá directamente al owner del repositorio,
`@copanicaballito-blip`, o usá **Security > Report a vulnerability** si está habilitado.

## Reglas del proyecto

- Este repositorio es público: nunca se suben contraseñas, emails del equipo ni datos de gastos reales.
- `docs/firebase-config.js` puede ir en el repo: no es secreto. Los datos los protegen el login y
  las reglas de Firestore (`firebase/firestore.rules`), que solo dejan entrar a los emails autorizados.
- Los emails reales se escriben únicamente en las reglas publicadas en la consola de Firebase.
