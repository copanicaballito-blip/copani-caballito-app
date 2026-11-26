package ar.copanicaballito.core

import kotlin.test.Test
import kotlin.test.assertEquals

class NegocioTest {
    @Test
    fun `el nombre del negocio es el esperado`() {
        assertEquals("Copani Caballito", Negocio.NOMBRE)
    }
}
