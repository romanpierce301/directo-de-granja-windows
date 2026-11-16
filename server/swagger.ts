export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Directo de Granja — API',
    version: '2.0.0',
    description:
      'API del backend central y sincronización en tiempo real entre la Aplicación de Windows del Dueño y las aplicaciones Android de los vendedores. Soporta autenticación JWT basada en roles (Dueño / Vendedor), sincronización idempotente por UUID, caché distribuida, auditoría inmutable e importación/exportación segura de Excel.',
    contact: {
      name: 'Directo de Granja — Te faltan huevos a nosotros nos sobran',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Servidor Backend Local / Gateway',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT emitido por /api/auth/login con rol dueno o vendedor.',
      },
    },
    schemas: {
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'dueno@directodegranja.mx' },
          password: { type: 'string', example: 'Granja2026!' },
        },
      },
      SyncPushPayload: {
        type: 'object',
        required: ['deviceId', 'deliveries'],
        properties: {
          deviceId: { type: 'string' },
          deliveries: { type: 'array', items: { type: 'object' } },
          payments: { type: 'array', items: { type: 'object' } },
          losses: { type: 'array', items: { type: 'object' } },
          incidents: { type: 'array', items: { type: 'object' } },
          customers: { type: 'array', items: { type: 'object' } },
        },
      },
      DailyPriceRequest: {
        type: 'object',
        required: ['pricePesosPerKg'],
        properties: {
          dateYmd: { type: 'string', example: '2026-11-16' },
          pricePesosPerKg: { type: 'number', example: 37.5 },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Monitoreo'],
        summary: 'Estado de salud del backend, almacenamiento y WebSockets',
        security: [],
        responses: {
          200: { description: 'Servicio saludable con métricas en tiempo real' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Autenticación JWT'],
        summary: 'Iniciar sesión y obtener token JWT con rol RBAC',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: { description: 'Autenticación exitosa con token JWT y perfil' },
          401: { description: 'Credenciales inválidas' },
          403: { description: 'Cuenta pendiente o bloqueada' },
        },
      },
    },
    '/auth/users': {
      get: {
        tags: ['Usuarios y Seguridad'],
        summary: 'Listar cuentas de usuarios y dispositivos autorizados (Solo Dueño)',
        responses: { 200: { description: 'Lista de usuarios y dispositivos' } },
      },
      post: {
        tags: ['Usuarios y Seguridad'],
        summary: 'Crear nuevo usuario con contraseña cifrada bcrypt (Solo Dueño)',
        responses: { 201: { description: 'Usuario creado' } },
      },
    },
    '/dashboard/state': {
      get: {
        tags: ['Panel Ejecutivo'],
        summary: 'Obtener estado completo sincronizado para la app de Windows del dueño',
        responses: { 200: { description: 'Estado completo de las 16 tablas y alertas' } },
      },
    },
    '/vendors/{id}/approve': {
      post: {
        tags: ['Vendedores'],
        summary: 'Aprobar cuenta de vendedor, asignar serie de folios y autorizar dispositivo único',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Vendedor aprobado y notificado en tiempo real' } },
      },
    },
    '/vendors/{id}/block': {
      post: {
        tags: ['Vendedores'],
        summary: 'Bloquear cuenta de vendedor sin borrar registros históricos',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Vendedor bloqueado' } },
      },
    },
    '/prices': {
      post: {
        tags: ['Precio del Día'],
        summary: 'Publicar el precio del kilo del día hacia todas las apps Android',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/DailyPriceRequest' } },
          },
        },
        responses: { 201: { description: 'Precio publicado y transmitido por WebSocket' } },
      },
    },
    '/deliveries/{id}/cancel': {
      post: {
        tags: ['Entregas y Remisiones'],
        summary: 'Cancelar entrega con motivo obligatorio conservando el folio',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Entrega cancelada e historial actualizado' } },
      },
    },
    '/deliveries/{id}/reprint': {
      post: {
        tags: ['Entregas y Remisiones'],
        summary: 'Registrar evento inmutable de reimpresión (COPIA) en bitácora',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Evento de reimpresión guardado' } },
      },
    },
    '/payments/{id}/verify': {
      post: {
        tags: ['Pagos y Transferencias'],
        summary: 'Confirmar depósito bancario (Por verificar -> Verificada)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Transferencia verificada' } },
      },
    },
    '/customers/{id}/payments': {
      post: {
        tags: ['Clientes y Saldos'],
        summary: 'Registrar abono posterior a la cuenta del cliente (aplica a ventas más antiguas)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Abono registrado y saldo recalculado' } },
      },
    },
    '/customers/merge': {
      post: {
        tags: ['Clientes y Saldos'],
        summary: 'Unir dos clientes duplicados creados sin conexión sumando sus saldos',
        responses: { 200: { description: 'Clientes unificados en auditoría' } },
      },
    },
    '/incidents/{id}/review': {
      post: {
        tags: ['Incidentes de Dinero'],
        summary: 'Marcar incidente como revisado y agregar nota del dueño',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Incidente revisado' } },
      },
    },
    '/closings': {
      post: {
        tags: ['Cierre General'],
        summary: 'Registrar cierre de caja por vendedor calculando diferencia sin explicar',
        responses: { 201: { description: 'Cierre guardado' } },
      },
    },
    '/sync/push': {
      post: {
        tags: ['Sincronización Android'],
        summary: 'Recibir lote de entregas, pagos, mermas e incidentes desde Android (idempotente por UUID)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SyncPushPayload' } },
          },
        },
        responses: { 200: { description: 'Lote procesado sin duplicados y emitido a Windows' } },
      },
    },
    '/sync/pull': {
      get: {
        tags: ['Sincronización Android'],
        summary: 'Descargar cambios para Android (precio del día, clientes, estado de aprobación)',
        parameters: [{ name: 'desde', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Cambios incrementales para el teléfono' } },
      },
    },
    '/excel/import': {
      post: {
        tags: ['Excel'],
        summary: 'Confirmar importación validada de clientes o precios',
        responses: { 200: { description: 'Registros importados y bitácora registrada' } },
      },
    },
    '/monitoring/alerts/{id}/ack': {
      post: {
        tags: ['Monitoreo'],
        summary: 'Confirmar lectura de alerta proactiva en tiempo real',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Alerta reconocida' } },
      },
    },
  },
};
