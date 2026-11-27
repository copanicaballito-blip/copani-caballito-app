// Envío de mails por SMTP (por defecto, una cuenta de Gmail con "contraseña de aplicación").

/** Crea la conexión al servidor de correo con los datos que vienen de los "secrets" de GitHub. */
export async function crearTransporte(env) {
  const { default: nodemailer } = await import("nodemailer");
  const puerto = Number(env.SMTP_PUERTO || 465);
  return nodemailer.createTransport({
    host: env.SMTP_SERVIDOR || "smtp.gmail.com",
    port: puerto,
    secure: puerto === 465, // 465 = conexión cifrada desde el principio
    ignoreTLS: env.SMTP_SIN_TLS === "1", // solo para pruebas con un servidor de mentira
    auth: { user: env.SMTP_USUARIO, pass: env.SMTP_CLAVE },
  });
}

/** Manda un correo ({ asunto, texto, html, adjuntos }) a la lista de destinatarios. */
export async function enviar(transporte, { de, para, correo }) {
  return transporte.sendMail({
    from: de,
    to: para,
    subject: correo.asunto,
    text: correo.texto,
    html: correo.html,
    attachments: correo.adjuntos,
  });
}
