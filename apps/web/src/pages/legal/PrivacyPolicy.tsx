import LegalPageShell from "@/components/legal/LegalPageShell";

const LAST = "24 de marzo de 2026";

const TOC = [
  { id: "identificacion", label: "1. Identificación del responsable" },
  { id: "datos-recopilamos", label: "2. Datos que recopilamos" },
  { id: "finalidad", label: "3. Finalidad del tratamiento" },
  { id: "base-legal", label: "4. Base legal del tratamiento" },
  { id: "decisiones-automatizadas", label: "5. Decisiones automatizadas y scoring" },
  { id: "comparticion", label: "6. Compartición de datos" },
  { id: "derechos", label: "7. Derechos del usuario" },
  { id: "retencion", label: "8. Retención de datos" },
  { id: "seguridad", label: "9. Seguridad" },
  { id: "cookies", label: "10. Cookies y tracking" },
  { id: "menores", label: "11. Menores de edad" },
  { id: "modificaciones", label: "12. Modificaciones" },
];

export default function PrivacyPolicy() {
  return (
    <LegalPageShell
      title="Política de Privacidad"
      lastUpdated={LAST}
      toc={TOC}
    >
      <section id="identificacion" className="scroll-mt-24">
        <h2>1. Identificación del responsable</h2>
        <p>
          El responsable del tratamiento de datos personales en la plataforma CODA, disponible en{" "}
          <strong>https://www.codafinance.cl</strong>, es:
        </p>
        <ul>
          <li>
            <strong>Razón social:</strong> CODA SpA (WeGroup), Chile
          </li>
          <li>
            <strong>RUT:</strong> XX.XXX.XXX-X <em>(dato pendiente de publicación)</em>
          </li>
          <li>
            <strong>Domicilio:</strong> Santiago, Chile
          </li>
          <li>
            <strong>Correo de contacto para datos personales:</strong>{" "}
            <a href="mailto:privacidad@codafinance.cl">privacidad@codafinance.cl</a>
          </li>
        </ul>
        <p className="text-sm text-slate-600">
          Fecha de última actualización de este documento: <strong>{LAST}</strong>.
        </p>
      </section>

      <section id="datos-recopilamos" className="scroll-mt-24">
        <h2>2. Datos que recopilamos</h2>
        <h3>a) Datos de registro y cuenta</h3>
        <p>
          Para crear y mantener su cuenta podemos tratar: nombre o identificación de perfil, correo electrónico,
          contraseña (almacenada mediante hash criptográfico, nunca en texto plano), y, cuando corresponda al
          servicio, identificador tributario (RUT) u otros datos que usted nos entregue voluntariamente en el
          formulario o en su perfil.
        </p>
        <h3>b) Datos financieros que el usuario entrega de forma voluntaria</h3>
        <p>
          Para ofrecer asesoría crediticia, scoring y funciones asociadas, usted puede subir o conectar
          información, entre otros:
        </p>
        <ul>
          <li>Informe de deudas u oficiales emitidos por la Comisión para el Mercado Financiero (CMF), en los formatos admitidos por la plataforma;</li>
          <li>Cartolas bancarias u otros documentos en PDF (p. ej. extractos) que usted nos proporcione;</li>
          <li>Notificaciones de pago o texto que pegue para análisis de gastos, cuando la funcionalidad lo permita.</li>
        </ul>
        <h3>c) Datos de uso de la plataforma</h3>
        <p>
          Para operar el servicio y mejorar su experiencia tratamos datos generados en su uso: gastos
          registrados, categorías, metas financieras, preferencias de visualización, interacciones con el
          comparador de productos y el asistente, y similares que usted ingresa en CODA.
        </p>
        <h3>d) Datos técnicos y de seguridad</h3>
        <p>
          Para seguridad, diagnóstico y cumplimiento podemos registrar, entre otros: dirección IP, tipo de
          dispositivo, sistema operativo, navegador, identificadores de sesión, y registros de acceso (logs)
          asociados a su cuenta cuando esté autenticado.
        </p>
      </section>

      <section id="finalidad" className="scroll-mt-24">
        <h2>3. Finalidad del tratamiento</h2>
        <p>Tratamos los datos anteriores para las siguientes finalidades:</p>
        <ul>
          <li>
            <strong>Prestación del servicio:</strong> operar la plataforma de salud financiera personal,
            incluyendo organizador de gastos, metas, división de cuentas y funciones de asesoría e información
            crediticia.
          </li>
          <li>
            <strong>Scoring crediticio y transaccional:</strong> calcular indicadores referenciales mediante
            modelos de aprendizaje automático (ML), a partir de la información que usted autoriza
            (p. ej. datos CMF, patrones transaccionales derivados de cartolas o movimientos).
          </li>
          <li>
            <strong>Recomendación de productos financieros:</strong> comparar y sugerir productos acordes a su
            perfil, cuando haya prestado el consentimiento correspondiente.
          </li>
          <li>
            <strong>Mejora de modelos:</strong> en forma agregada y anonimizada cuando sea posible, para
            calibrar y mejorar algoritmos, sin perjuicio de la trazabilidad exigida por la normativa aplicable.
          </li>
          <li>
            <strong>Comunicaciones relacionadas al servicio:</strong> notificaciones sobre su cuenta,
            seguridad o cambios relevantes en el servicio. El envío de comunicaciones comerciales
            requerirá consentimiento específico cuando la ley así lo exija.
          </li>
          <li>
            <strong>Cumplimiento regulatorio:</strong> cumplir obligaciones aplicables ante la CMF y demás
            autoridades, incluida la Ley 21.521 (Ley Fintec), la NCG 502 y demás normas que resulten
            pertinentes al prestador de servicios basados en información.
          </li>
        </ul>
        <p>
          El tratamiento se ajustará a la futura Ley de Protección de Datos Personales de Chile en lo que
          resulte aplicable cuando entre en vigencia.
        </p>
      </section>

      <section id="base-legal" className="scroll-mt-24">
        <h2>4. Base legal del tratamiento</h2>
        <p>Según el caso, apoyamos el tratamiento en:</p>
        <ul>
          <li>
            <strong>Ejecución del contrato o medidas precontractuales</strong> con usted (uso de la
            plataforma según los Términos y Condiciones).
          </li>
          <li>
            <strong>Consentimiento explícito</strong> cuando corresponda, en particular para datos
            financieros sensibles o finalidades opcionales (p. ej. marketing).
          </li>
          <li>
            <strong>Obligación legal</strong> aplicable al responsable, incluida reportería o requerimientos
            de la CMF (p. ej. NCG 530 u otras normas vigentes).
          </li>
          <li>
            <strong>Interés legítimo</strong>, debidamente balanceado con sus derechos, para seguridad de la
            plataforma, prevención de fraude y mejora del servicio en términos agregados.
          </li>
        </ul>
      </section>

      <section id="decisiones-automatizadas" className="scroll-mt-24">
        <h2>5. Decisiones automatizadas y scoring algorítmico</h2>
        <p>
          CODA utiliza modelos de machine learning y reglas para calcular scores crediticios y
          transaccionales <strong>referenciales</strong>, orientados al autoconocimiento financiero y a la
          presentación de información en la plataforma.
        </p>
        <ul>
          <li>
            Puede solicitar información sobre los factores que influyen en su score de acuerdo con los
            canales habilitados en la aplicación y la normativa vigente (incluida la trazabilidad
            algorítmica conforme a la <strong>NCG 502</strong> de la CMF, en lo aplicable).
          </li>
          <li>
            Los modelos consideran, entre otros, información derivada de informes CMF autorizados y
            comportamiento transaccional según los documentos y datos que usted nos proporcione.
          </li>
          <li>
            Mantenemos trazabilidad de procesos algorítmicos en la medida requerida por la normativa
            aplicable al prestador.
          </li>
          <li>
            El <strong>score mostrado en CODA no constituye por sí solo una decisión crediticia</strong> ni
            reemplaza las evaluaciones que realicen bancos u otras instituciones financieras.
          </li>
        </ul>
      </section>

      <section id="comparticion" className="scroll-mt-24">
        <h2>6. Compartición de datos</h2>
        <p>
          <strong>CODA no vende ni alquila sus datos personales a terceros para fines de lucro independiente.</strong>
        </p>
        <p>Podemos compartir o encargar el tratamiento de datos únicamente en los siguientes supuestos:</p>
        <ul>
          <li>
            <strong>Instituciones financieras:</strong> cuando usted <strong>solicite expresamente</strong> un
            producto o canal y autorice el envío de la información necesaria para esa solicitud o referencia.
          </li>
          <li>
            <strong>Proveedores de infraestructura (subencargados):</strong> p. ej. alojamiento en la nube
            (como Vercel, Render u otros), bajo contratos o cláusulas que exijan confidencialidad y
            tratamiento acorde a esta política.
          </li>
          <li>
            <strong>Autoridades:</strong> cuando la CMF u otra autoridad competente lo exija por ley o
            resolución fundada.
          </li>
          <li>
            <strong>Comisiones por referido:</strong> cuando contrate un producto a través de la plataforma,
            la institución financiera puede recibir confirmación de la referencia necesaria para liquidar la
            comisión, <strong>sin vender un perfil de datos de marketing</strong> a terceros.
          </li>
        </ul>
      </section>

      <section id="derechos" className="scroll-mt-24">
        <h2>7. Derechos del usuario (Ley 19.628)</h2>
        <p>Usted puede ejercer los derechos que reconoce la Ley 19.628 sobre datos personales, entre otros:</p>
        <ul>
          <li>
            <strong>Acceso:</strong> solicitar información sobre los datos que tratamos en relación con usted.
          </li>
          <li>
            <strong>Rectificación:</strong> solicitar la corrección de datos inexactos o incompletos.
          </li>
          <li>
            <strong>Cancelación o bloqueo:</strong> solicitar la eliminación o el cese del tratamiento en los
            casos previstos en la ley.
          </li>
          <li>
            <strong>Oposición:</strong> oponerse al tratamiento para ciertos fines cuando corresponda.
          </li>
        </ul>
        <p>
          Canal preferente: <a href="mailto:privacidad@codafinance.cl">privacidad@codafinance.cl</a>. Nos
          comprometemos a responder dentro de un plazo razonable, en general{" "}
          <strong>no superior a 30 días hábiles</strong>, salvo complejidad o requisitos legales adicionales.
        </p>
      </section>

      <section id="retencion" className="scroll-mt-24">
        <h2>8. Retención de datos</h2>
        <ul>
          <li>
            <strong>Cuenta activa:</strong> conservamos los datos necesarios mientras mantenga su cuenta y el
            servicio contratado.
          </li>
          <li>
            <strong>Documentos financieros subidos:</strong> por un período máximo de{" "}
            <strong>24 meses</strong> o hasta que solicite su eliminación o cierre de cuenta, según lo que
            ocurra primero y salvo obligación legal de conservación más larga.
          </li>
          <li>
            <strong>Registros de auditoría algorítmica:</strong> hasta <strong>4 años</strong> cuando corresponda
            para cumplir la NCG 502 y demás exigencias de trazabilidad.
          </li>
          <li>
            <strong>Datos tributarios o regulatorios:</strong> según los plazos legales aplicables en Chile.
          </li>
        </ul>
      </section>

      <section id="seguridad" className="scroll-mt-24">
        <h2>9. Seguridad</h2>
        <p>
          Aplicamos medidas técnicas y organizativas razonables, entre ellas: comunicación cifrada mediante
          TLS (HTTPS), almacenamiento de contraseñas mediante funciones de hash y sal, control de accesos por
          rol en el equipo autorizado, y monitoreo de eventos de seguridad relevantes. Ningún sistema es
          invulnerable; si detectamos un incidente que afecte sus datos, lo comunicaremos cuando la ley así lo
          exija.
        </p>
      </section>

      <section id="cookies" className="scroll-mt-24">
        <h2>10. Cookies y tracking</h2>
        <p>
          CODA no utiliza cookies de publicidad comportamental de terceros para fines de remarketing.
          La sesión de la aplicación puede mantenerse mediante <strong>token JWT</strong> almacenado
          en el dispositivo del usuario (p. ej. almacenamiento local del navegador), necesario para
          recordar su sesión.
        </p>
      </section>

      <section id="menores" className="scroll-mt-24">
        <h2>11. Menores de edad</h2>
        <p>
          El servicio está dirigido a mayores de <strong>18 años</strong>. No solicitamos datos de menores de
          edad de forma voluntaria. Si tiene conocimiento de que un menor nos ha proporcionado datos, por
          favor contáctenos en privacidad@codafinance.cl.
        </p>
      </section>

      <section id="modificaciones" className="scroll-mt-24">
        <h2>12. Modificaciones</h2>
        <p>
          Podemos actualizar esta Política de Privacidad para reflejar cambios legales, regulatorios o en el
          servicio. En caso de cambios relevantes, le notificaremos por correo electrónico o mediante aviso
          destacado en la plataforma. La versión vigente estará siempre disponible en{" "}
          <strong>https://www.codafinance.cl/privacidad</strong>.
        </p>
      </section>
    </LegalPageShell>
  );
}
