import LegalPageShell from "@/components/legal/LegalPageShell";

const LAST = "24 de marzo de 2026";

const TOC = [
  { id: "identificacion", label: "1. Identificación y aceptación" },
  { id: "descripcion", label: "2. Descripción del servicio" },
  { id: "registro", label: "3. Registro y cuenta" },
  { id: "uso-aceptable", label: "4. Uso aceptable" },
  { id: "consentimiento-datos", label: "5. Datos financieros" },
  { id: "comparador", label: "6. Comparador y recomendaciones" },
  { id: "score", label: "7. Score crediticio" },
  { id: "limitacion", label: "8. Limitación de responsabilidad" },
  { id: "propiedad", label: "9. Propiedad intelectual" },
  { id: "tarifas", label: "10. Tarifas" },
  { id: "terminacion", label: "11. Terminación" },
  { id: "ley-aplicable", label: "12. Ley y jurisdicción" },
  { id: "contacto", label: "13. Contacto" },
];

export default function TermsAndConditions() {
  return (
    <LegalPageShell title="Términos y Condiciones de Uso" lastUpdated={LAST} toc={TOC}>
      <section id="identificacion" className="scroll-mt-24">
        <h2>1. Identificación y aceptación</h2>
        <p>
          El presente documento regula el acceso y uso de la plataforma digital{" "}
          <strong>CODA</strong>, operada por <strong>Chile Open-Data Analytics SpA</strong>, RUT
          78.389.632-K, en adelante <strong>&ldquo;CODA&rdquo;</strong> o{" "}
          <strong>”nosotros”</strong>, disponible en <strong>https://www.codafinance.cl</strong>.
        </p>
        <p>
          CODA es un <strong>prestador de servicios financieros</strong> en proceso de inscripción
          ante la Comisión para el Mercado Financiero (CMF) como{" "}
          <strong>Prestador de Servicios Basados en Información (PSBI)</strong>, conforme a la{" "}
          <strong>Ley 21.521</strong> (Ley Fintec) y normativa complementaria.
        </p>
        <p>
          Al registrarse, crear una cuenta o utilizar la plataforma, usted declara haber leído y
          aceptado estos Términos y Condiciones y la Política de Privacidad vigente. Si no está de
          acuerdo, debe abstenerse de usar el servicio.
        </p>
        <p>
          El servicio está dirigido a personas mayores de <strong>18 años</strong> con capacidad
          para obligarse en Chile.
        </p>
        <p className="text-sm text-slate-600">
          Última actualización: <strong>{LAST}</strong>.
        </p>
      </section>

      <section id="descripcion" className="scroll-mt-24">
        <h2>2. Descripción del servicio</h2>
        <p>
          CODA es una <strong>plataforma de salud financiera personal</strong> que ofrece, entre
          otras, herramientas de información y organización: organizador de gastos, indicadores de
          score crediticio y transaccional de carácter referencial (incluido modelos de aprendizaje
          automático), comparador de productos financieros, asistente financiero, división de
          cuentas con terceros y funciones relacionadas que se describen en el sitio.
        </p>
        <p>
          <strong>
            CODA no es un banco, no es una institución financiera y no otorga créditos directos.
          </strong>{" "}
          La información y asesoría mostrada en la plataforma tiene carácter general e informativo,
          salvo donde se indique expresamente otro alcance.
        </p>
        <p>
          El <strong>score crediticio</strong> u otros indicadores calculados en CODA son{" "}
          <strong>referenciales</strong>, orientados al autoconocimiento financiero y a la
          comparación dentro de la plataforma; <strong>no reemplazan</strong> informes crediticios
          oficiales ni las evaluaciones que realicen bancos, cooperativas u otras instituciones
          financieras.
        </p>
      </section>

      <section id="registro" className="scroll-mt-24">
        <h2>3. Registro y cuenta</h2>
        <ul>
          <li>
            Usted es responsable de la <strong>veracidad</strong> de los datos que proporcione al
            registrarse y de mantenerlos actualizados cuando sea razonablemente necesario.
          </li>
          <li>
            La <strong>confidencialidad de su contraseña</strong> y credenciales es su
            responsabilidad. No debe compartir su cuenta con terceros.
          </li>
          <li>
            CODA podrá <strong>suspender o terminar</strong> cuentas ante uso fraudulento, abusivo,
            contrario a la ley o a estos términos, o ante requerimiento de autoridad competente.
          </li>
        </ul>
      </section>

      <section id="uso-aceptable" className="scroll-mt-24">
        <h2>4. Uso aceptable</h2>
        <p>El usuario se compromete a:</p>
        <ul>
          <li>
            Utilizar el servicio solo para fines personales, lícitos y no prohibidos por la ley.
          </li>
          <li>
            No cargar documentos falsos, alterados o que pertenezcan a terceros sin autorización.
          </li>
          <li>
            No intentar acceder a datos, cuentas o sistemas de otros usuarios o de CODA sin
            autorización.
          </li>
          <li>
            No realizar ingeniería inversa de los modelos, algoritmos o software de la plataforma,
            salvo en la medida permitida por ley imperativa.
          </li>
          <li>No utilizar el servicio para transmitir malware, spam o contenido ilícito.</li>
        </ul>
      </section>

      <section id="consentimiento-datos" className="scroll-mt-24">
        <h2>5. Datos financieros — consentimiento informado</h2>
        <p>
          La subida de cartolas bancarias, informes CMF u otros documentos financieros es{" "}
          <strong>voluntaria</strong>. Al hacerlo, usted declara contar con legitimación o
          autorización para tratar esa información en CODA.
        </p>
        <p>
          Usted autoriza el tratamiento de dichos datos para las finalidades descritas en la{" "}
          <strong>Política de Privacidad</strong> y en los consentimientos que acepte en la
          aplicación.
        </p>
        <p>
          Podrá solicitar la eliminación o gestionar sus datos desde su perfil o mediante los
          canales indicados en la política de privacidad, sujeto a retenciones legales aplicables.
        </p>
      </section>

      <section id="comparador" className="scroll-mt-24">
        <h2>6. Comparador y recomendación de productos</h2>
        <p>
          Las recomendaciones y ordenaciones se basan en el perfil del usuario, criterios
          algorítmicos y datos disponibles en la plataforma. La existencia de acuerdos comerciales
          con instituciones financieras no implica exclusividad en la oferta de productos.
        </p>
        <p>
          <strong>CODA puede percibir comisiones</strong> cuando un usuario contrata un producto
          financiero a través de la plataforma o mediante enlaces de referencia acordados. Esta
          relación comercial se declara expresamente y no exime a CODA de actuar con diligencia y
          transparencia razonables en la presentación de información.
        </p>
        <p>
          La decisión de contratar o no un producto es{" "}
          <strong>libre y exclusiva del usuario</strong>.
        </p>
      </section>

      <section id="score" className="scroll-mt-24">
        <h2>7. Score crediticio</h2>
        <p>
          El score calculado en CODA es una herramienta referencial de autoconocimiento y
          comparación dentro del servicio.{" "}
          <strong>No constituye un informe crediticio oficial</strong> ni una aprobación de crédito.
          Las instituciones financieras aplican sus propios modelos y políticas.
        </p>
      </section>

      <section id="limitacion" className="scroll-mt-24">
        <h2>8. Limitación de responsabilidad</h2>
        <ul>
          <li>
            CODA no garantiza la exactitud absoluta de los datos ingresados por el usuario ni de
            fuentes externas que dependan de terceros.
          </li>
          <li>
            CODA no es responsable de las <strong>decisiones financieras</strong> que el usuario
            adopte con base en la información de la plataforma; el uso de la información es bajo su
            propio riesgo y criterio.
          </li>
          <li>
            En la medida permitida por la ley chilena, en caso de fallos del servicio o
            interrupciones, la responsabilidad de CODA se limitará a lo que corresponda según el
            servicio; en caso de servicio gratuito, la responsabilidad se limitará en la medida
            máxima permitida por la ley aplicable.
          </li>
        </ul>
      </section>

      <section id="propiedad" className="scroll-mt-24">
        <h2>9. Propiedad intelectual</h2>
        <p>
          El software, marca, diseño de interfaz, documentación y modelos propietarios de CODA están
          protegidos por leyes de propiedad intelectual e industrial. Queda prohibida su uso no
          autorizado.
        </p>
        <p>
          El usuario conserva la titularidad de su <strong>datos personales</strong> y del contenido
          que legitima mente cargue, otorgando a CODA la licencia necesaria para operar el servicio
          según la Política de Privacidad.
        </p>
      </section>

      <section id="tarifas" className="scroll-mt-24">
        <h2>10. Tarifas</h2>
        <p>
          El <strong>servicio básico es actualmente gratuito</strong> para el usuario final, salvo
          que se indique en la aplicación o por comunicación separada la existencia de planes de
          pago.
        </p>
        <p>
          CODA se reserva el derecho de introducir planes de pago o funciones premium con{" "}
          <strong>previo aviso razonable</strong>. Las funciones básicas podrán seguir ofreciéndose
          en modalidad gratuita según lo que CODA determine en cada momento.
        </p>
      </section>

      <section id="terminacion" className="scroll-mt-24">
        <h2>11. Terminación</h2>
        <ul>
          <li>
            <strong>Usuario:</strong> puede eliminar su cuenta o dejar de usar el servicio en
            cualquier momento, según las opciones habilitadas en la plataforma.
          </li>
          <li>
            <strong>CODA:</strong> podrá discontinuar el servicio o partes del mismo con un aviso de
            al menos <strong>30 días</strong> cuando sea razonablemente posible, salvo causas de
            fuerza mayor o requerimiento legal.
          </li>
          <li>
            Ante incumplimiento grave de estos términos o de la ley, CODA podrá{" "}
            <strong>suspender</strong> el acceso sin perjuicio de otras acciones que correspondan.
          </li>
        </ul>
      </section>

      <section id="ley-aplicable" className="scroll-mt-24">
        <h2>12. Ley aplicable y jurisdicción</h2>
        <p>
          Estos Términos se rigen por las leyes de la <strong>República de Chile</strong>. Las
          partes someten a la competencia de los{" "}
          <strong>tribunales ordinarios de justicia de Santiago</strong>, salvo normas imperativas
          en contrario.
        </p>
      </section>

      <section id="contacto" className="scroll-mt-24">
        <h2>13. Contacto</h2>
        <ul>
          <li>
            <strong>Consultas legales:</strong>{" "}
            <a href="mailto:legal@codafinance.cl">legal@codafinance.cl</a>
          </li>
          <li>
            <strong>Reclamos y atención general:</strong>{" "}
            <a href="mailto:info@codafinance.cl">info@codafinance.cl</a>
          </li>
          <li>
            <strong>Protección de datos personales:</strong>{" "}
            <a href="mailto:privacidad@codafinance.cl">privacidad@codafinance.cl</a>
          </li>
        </ul>
      </section>
    </LegalPageShell>
  );
}
