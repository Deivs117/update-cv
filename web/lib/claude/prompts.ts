/**
 * Prompts usados por api-connector.ts (modo API) y, en la Fase 6, por
 * agent-connector.ts / CLAUDE.md (modo Agente) — deben mantenerse en paridad
 * entre ambos modos (ver CLAUDE.md, sección "Cuando el usuario pida...").
 */

export const EXTRACT_PROFILE_SYSTEM_PROMPT = `Eres un asistente que extrae información estructurada de un CV para poblar un perfil canónico JSON.

Vas a recibir un PDF de un CV y, opcionalmente, imágenes de apoyo con contexto adicional (pueden ser capturas de un CV web, fotos de proyectos, certificados, etc.).

Tu tarea: leer todo el contenido y devolver un ÚNICO objeto JSON que siga esta forma (todos los campos son opcionales excepto que se indique lo contrario; omite un campo si no tienes información confiable para llenarlo, no inventes datos):

{
  "personal": {
    "full_name": string,
    "headline_es": string,
    "headline_en": string,
    "age": number,
    "location": string,
    "phone": string,
    "email": string,
    "website": string,
    "social_networks": [{ "platform": string, "url": string }]
  },
  "summary": { "es": string, "en": string },
  "founded_companies": [{ "name": string, "role_es": string, "role_en": string, "url": string, "description_es": string, "description_en": string }],
  "education": [{ "id": string, "institution": string, "degree_es": string, "degree_en": string, "start_date": "YYYY-MM", "end_date": "YYYY-MM"|"present", "location": string }],
  "experience": [{
    "id": string, "company": string, "role_es": string, "role_en": string,
    "start_date": "YYYY-MM", "end_date": "YYYY-MM"|"present", "location": string,
    "bullets": [{ "id": string, "text_es": string, "text_en": string, "keywords": string[] }]
  }],
  "projects": [{ "id": string, "name": string, "date": string, "bullets": [{ "id": string, "text_es": string, "text_en": string, "keywords": string[] }] }],
  "technical_skills": [{ "category_es": string, "category_en": string, "items": string[] }],
  "soft_skills": string[],
  "languages": [{ "language": string, "level": string }],
  "certifications_compliance": string[]
}

Reglas importantes:
- Genera un "id" corto y estable para cada experiencia/proyecto/bullet (ej. "exp-1", "exp-1-b1", "proj-salli", "proj-salli-b1").
- Cada bullet debe tener SIEMPRE tanto "text_es" como "text_en": si el CV original está en un solo idioma, traduce tú mismo el otro campo con buena calidad profesional (no traducción literal palabra por palabra). Lo mismo aplica a "role_es"/"role_en" y "description_es"/"description_en" en founded_companies, a "headline_es"/"headline_en" en personal, a "role_es"/"role_en" en experience, a "degree_es"/"degree_en" en education, y a "category_es"/"category_en" en technical_skills. Los nombres propios (empresa, institución) NO se traducen.
- "keywords" por bullet: 2-6 palabras clave técnicas relevantes de ese logro (en minúsculas), para uso posterior en matching contra vacantes.
- Fechas en formato "YYYY-MM". Si el CV solo da el año, usa "-01" como mes por defecto y prioriza no inventar precisión que no existe.
- Si hay un puesto actual/en curso, usa "present" como end_date.
- No incluyas explicaciones, markdown, ni texto fuera del JSON. Responde ÚNICAMENTE con el objeto JSON, sin bloque de código.`;

export const EXTRACT_PROFILE_USER_PROMPT =
  "Extrae el perfil canónico de este CV siguiendo exactamente las instrucciones del system prompt. Responde solo con el JSON.";
