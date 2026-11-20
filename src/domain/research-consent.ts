export interface ConsentPage {
  sections: Array<{ title: string; paragraphs: string[] }>;
}

export interface ResearchConsentDocument {
  version: string;
  issuedOn: string;
  studyTitle: string;
  investigator: string;
  affiliation: string;
  advisor: string;
  investigatorEmail: string;
  pages: ConsentPage[];
}

export const researchConsentDocument: ResearchConsentDocument = {
  version: '3',
  issuedOn: '2026-11-11',
  studyTitle: 'Sistema de Gestión Automatizada de Pedidos para Talleres Textiles',
  investigator: 'Kevin Antonio Navarro Carrera',
  affiliation: 'Pontificia Universidad Católica del Perú, Ingeniería Informática',
  advisor: 'Luis Alberto Flores García',
  investigatorEmail: 'navarro.kevin@pucp.edu.pe',
  pages: [
    {
      sections: [
        {
          title: 'Invitación y finalidad',
          paragraphs: [
            'Te invitamos a participar en esta investigación de tesis de pregrado. Buscamos evaluar cómo un portal ayuda a registrar las especificaciones de polos y asignar el trabajo a talleres de Perú Activa S.A.C., considerando su capacidad, disponibilidad y el plazo solicitado.',
            'Te invitamos porque eres cliente de Perú Activa o representas a una organización que solicita polos y puedes evaluar el proceso desde tu experiencia.',
          ],
        },
        {
          title: 'Qué harás y cuánto tiempo tomará',
          paragraphs: [
            'La participación consiste en una sesión individual de hasta 30 minutos. Completarás tu perfil, registrarás un pedido, revisarás la cotización y su aceptación o rechazo, consultarás la asignación y podrás dar comentarios sobre tu experiencia. Las esperas de respuesta de Perú Activa y los talleres se registran por separado y pueden extender el recorrido en el calendario.',
            'Recogeremos tu nombre, correo verificado, RUC, razón social, cargo, especificaciones del pedido, cotización, decisiones, asignaciones, fechas, tiempos y los comentarios que decidas proporcionar. Usaremos el formulario del portal, sus registros de actividad y tus respuestas a preguntas de evaluación.',
            'La cotización, la compra y los compromisos comerciales tienen su propia confirmación. El consentimiento se refiere a tu participación en la investigación.',
          ],
        },
        {
          title: 'Tu decisión',
          paragraphs: [
            'Participar es una decisión libre. Puedes hacer preguntas antes y durante la prueba y el investigador las responderá. Puedes omitir preguntas de evaluación que te incomoden o dejar el estudio en cualquier momento, sin justificarte. Tu decisión no generará sanciones, pérdida de beneficios ni perjuicio en tu relación comercial con Perú Activa.',
            'El registro de este piloto se completa cuando aceptas participar. Si prefieres no hacerlo, puedes cerrar el formulario y comunicarte con el investigador. Puedes retirar tu autorización mediante el correo indicado en este documento.',
          ],
        },
      ],
    },
    {
      sections: [
        {
          title: 'Riesgos y protección',
          paragraphs: [
            'La sesión puede ocasionar cansancio, incomodidad al responder o requerir tiempo de tu jornada. Puedes pedir una pausa o terminar tu participación. Existe riesgo de exposición de datos personales o información comercial si ocurre un acceso indebido.',
            'Para reducir ese riesgo se utilizarán acceso por cuenta verificada, permisos de consulta, almacenamiento con acceso restringido y comunicaciones protegidas. Las evidencias académicas se revisarán para ocultar datos que permitan identificar personas u organizaciones. Ante un problema, podrás contactar al investigador para evaluar las medidas de protección correspondientes.',
          ],
        },
        {
          title: 'Beneficios',
          paragraphs: [
            'Tu experiencia puede contribuir a mejorar el registro y la asignación de pedidos en pequeñas empresas textiles. Podrás conocer el funcionamiento del portal y recibir el resumen de resultados. No se garantiza una mejora particular para tu pedido. La participación no tiene pago ni incentivo económico.',
          ],
        },
        {
          title: 'Confidencialidad y conservación',
          paragraphs: [
            'Tu participación será confidencial. El investigador conocerá tu identidad y podrá revisar la información con el asesor. En la tesis, la sustentación y el resumen de resultados se usarán códigos y se ocultarán nombres, correos, RUC y otros identificadores. Perú Activa verá los datos del pedido necesarios para su gestión.',
            'La información identificable recogida para el estudio, la relación entre códigos e identidades y las constancias de consentimiento se conservarán durante tres años desde la publicación de la tesis. Al finalizar ese plazo se eliminarán de los archivos del estudio y sus respaldos bajo responsabilidad del investigador. La tesis publicada conservará sus resultados sin identificadores personales.',
            'Se aplicarán las medidas de protección de datos correspondientes a la Ley 29733. Un uso de estos datos en otra investigación o producto requerirá una nueva autorización. Puedes solicitar el retiro de tus datos identificables al investigador. La información ya incorporada a resultados agregados que no permitan identificarte puede no ser separable.',
          ],
        },
      ],
    },
    {
      sections: [
        {
          title: 'Resultados y consultas',
          paragraphs: [
            'Al concluir la tesis, el investigador enviará un resumen de resultados en PDF al correo que verificaste en el portal. También podrás solicitarlo por ese mismo medio.',
            'Para preguntas sobre el estudio, tu participación, tus datos o el retiro de tu autorización, escribe a Kevin Antonio Navarro Carrera, navarro.kevin@pucp.edu.pe.',
            'Para consultas o reclamos sobre ética de la investigación en la PUCP puedes contactar a etica.investigacion@pucp.edu.pe o al celular 964233827.',
          ],
        },
        {
          title: 'Copia del documento',
          paragraphs: [
            'Puedes descargar una copia de este documento antes de decidir. Después de aceptar, tendrás una copia del documento y de tu constancia de aceptación desde el portal. Puedes imprimirla o guardarla como PDF mediante la opción de impresión de tu navegador.',
          ],
        },
        {
          title: 'Aceptación electrónica',
          paragraphs: [
            'Al marcar la casilla y pulsar Guardar y continuar, declaras que recibiste y comprendiste esta información, que puedes plantear tus preguntas al investigador y que aceptas participar voluntariamente.',
            'La casilla se presenta desmarcada. La constancia vincula tu nombre y cuenta de correo verificada con la fecha y hora de aceptación, la versión y fecha del documento y una huella digital de su contenido. Se conserva el texto que aceptaste para que puedas obtener la misma copia posteriormente.',
            'El investigador que solicita y obtiene este consentimiento es Kevin Antonio Navarro Carrera. Este protocolo se presenta por medios electrónicos con la fecha de emisión que figura en todas sus páginas. La forma alternativa de registro de aceptación queda descrita en el proyecto.',
          ],
        },
      ],
    },
  ],
};
