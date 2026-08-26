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
  "soft_skills": [{ "text_es": string, "text_en": string }],
  "languages": [{ "language_es": string, "language_en": string, "level_es": string, "level_en": string }],
  "certifications_compliance": string[]
}

Reglas importantes:
- Genera un "id" corto y estable para cada experiencia/proyecto/bullet (ej. "exp-1", "exp-1-b1", "proj-salli", "proj-salli-b1").
- Cada bullet debe tener SIEMPRE tanto "text_es" como "text_en": si el CV original está en un solo idioma, traduce tú mismo el otro campo con buena calidad profesional (no traducción literal palabra por palabra). Lo mismo aplica a "role_es"/"role_en" y "description_es"/"description_en" en founded_companies, a "headline_es"/"headline_en" en personal, a "role_es"/"role_en" en experience, a "degree_es"/"degree_en" en education, a "category_es"/"category_en" en technical_skills, a "text_es"/"text_en" en soft_skills, y a "language_es"/"language_en" y "level_es"/"level_en" en languages (ej. "Spanish"/"Español", "Native"/"Nativo"). Los nombres propios (empresa, institución) NO se traducen.
- "keywords" por bullet: 2-6 palabras clave técnicas relevantes de ese logro (en minúsculas), para uso posterior en matching contra vacantes.
- Fechas en formato "YYYY-MM". Si el CV solo da el año, usa "-01" como mes por defecto y prioriza no inventar precisión que no existe.
- Si hay un puesto actual/en curso, usa "present" como end_date.
- No incluyas explicaciones, markdown, ni texto fuera del JSON. Responde ÚNICAMENTE con el objeto JSON, sin bloque de código.`;

export const EXTRACT_PROFILE_USER_PROMPT =
  "Extrae el perfil canónico de este CV siguiendo exactamente las instrucciones del system prompt. Responde solo con el JSON.";

/** Sección 9.2 — Paso 1: análisis de la vacante. */
export const ANALYZE_JOB_SYSTEM_PROMPT = `Eres un asistente que analiza descripciones de vacantes de empleo para extraer información estructurada útil para adaptar un CV.

Vas a recibir el texto completo de una vacante. Devuelve ÚNICAMENTE un objeto JSON con esta forma:

{
  "required_technical_skills": string[],
  "soft_skills": string[],
  "sector_keywords": string[],
  "seniority": string
}

Reglas:
- "required_technical_skills": tecnologías, herramientas, lenguajes, frameworks, certificaciones técnicas mencionadas o claramente implícitas (en minúsculas cuando aplique, ej. "python", "aws").
- "soft_skills": habilidades blandas pedidas o implícitas (ej. "liderazgo", "comunicación").
- "sector_keywords": palabras clave del sector/empresa/dominio (ej. "fintech", "manufactura", "salud", nombre de metodologías como "scrum").
- "seniority": nivel esperado en una palabra o frase corta (ej. "junior", "senior", "lead", "sin especificar").
- MUY IMPORTANTE: todo el texto de los arrays (skills, keywords, seniority) debe estar en el MISMO IDIOMA que el texto de la vacante recibida (si la vacante está en inglés, responde en inglés; si está en español, responde en español). Esto es clave para el matching léxico ATS posterior -- nunca traduzcas al español por defecto.
- No inventes requisitos que no estén en el texto. Si la vacante es muy corta o ambigua, es válido devolver arrays cortos.
- No incluyas explicaciones ni markdown. Responde ÚNICAMENTE con el JSON.`;

export function buildAnalyzeJobUserPrompt(jobDescription: string): string {
  return `Analiza esta vacante y responde solo con el JSON:\n\n${jobDescription}`;
}

/** Sección 9.3 — Paso 2: selección y reescritura de contenido. */
export const TAILOR_CV_SYSTEM_PROMPT = `Eres un asistente experto en redacción de CVs ATS-friendly. Vas a recibir:
1. El contenido disponible de un candidato (resumen, experiencia con bullets, proyectos, skills, soft skills), cada bullet con un "id" estable.
2. El análisis de una vacante específica (skills requeridas, soft skills, keywords de sector, seniority).
3. Un número recomendado de páginas objetivo (orientativo, no obligatorio de cumplir de forma exacta).

Tu tarea: seleccionar y reescribir el contenido más relevante para ESA vacante específica, maximizando coincidencia léxica con sus keywords (clave para ATS), sin inventar logros ni tecnologías que el candidato no tiene.

Devuelve ÚNICAMENTE un objeto JSON con esta forma:

{
  "summary": string,
  "experience": [{
    "id": string,
    "bullets": [{ "id": string, "text": string, "keywords": string[] }]
  }],
  "projects": [{
    "id": string,
    "bullets": [{ "id": string, "text": string, "keywords": string[] }]
  }],
  "technical_skills": [{ "category": string, "items": string[] }],
  "soft_skills": string[]
}

Reglas:
- "id" en experience/projects debe ser exactamente uno de los ids recibidos en el contenido disponible -- no inventes ids nuevos. Omite por completo las experiencias/proyectos que decidas no incluir (no los listes con bullets vacíos).
- Cada bullet en la salida debe referenciar el "id" de un bullet real recibido (puedes omitir bullets de baja relevancia para esta vacante, pero no inventar bullets nuevos). Puedes reescribir el "text" para alinear el lenguaje con la vacante (mismo idioma que el contenido recibido, sin traducir), pero sin inventar logros, tecnologías o métricas que no estén en el bullet original.
- Prioriza orden: primero las experiencias/proyectos/bullets más relevantes para esta vacante específica.
- "technical_skills" y "soft_skills": reordena y filtra (puedes omitir grupos/items irrelevantes) los recibidos, priorizando lo que pide la vacante. No inventes skills nuevas.
- "summary": reescribe el resumen del candidato (2-4 líneas) enfatizando su fit con esta vacante específica, en el mismo idioma del contenido recibido.
- El número de páginas recomendado es orientativo: si el contenido disponible es mucho más extenso que lo que cabría razonablemente, prioriza fuertemente lo más relevante, pero NO es obligatorio recortar todo a la fuerza -- el sistema mostrará al usuario cuántas páginas quedó el resultado final para que él decida si recortar más.
- No incluyas explicaciones ni markdown. Responde ÚNICAMENTE con el JSON.`;

const LANGUAGE_LABEL: Record<"es" | "en", string> = { es: "español", en: "English" };

export function buildTailorCVUserPrompt(input: {
  candidateContentJson: string;
  jobDescription: string;
  jobAnalysisJson: string;
  recommendedMaxPages: number;
  language: "es" | "en";
}): string {
  return `Contenido disponible del candidato (JSON):
${input.candidateContentJson}

Análisis de la vacante (JSON):
${input.jobAnalysisJson}

Texto completo de la vacante (para contexto adicional de lenguaje/tono):
${input.jobDescription}

Número de páginas recomendado (orientativo): ${input.recommendedMaxPages}

IMPORTANTE: todo el texto que generes ("summary", "text" de cada bullet) debe estar en ${LANGUAGE_LABEL[input.language]}, sin importar en qué idioma esté escrito este mensaje o la vacante. No mezcles idiomas.

Responde solo con el JSON del contenido adaptado.`;
}

/** Módulo 4 (sección 10) — generación de carta de presentación. */
export const COVER_LETTER_SYSTEM_PROMPT = `Eres un asistente que escribe cartas de presentación (cover letters) profesionales y persuasivas para vacantes de empleo específicas.

Vas a recibir el contenido disponible de un candidato (resumen, experiencia, proyectos, skills), el análisis de una vacante, y el texto completo de la vacante.

Tu tarea: escribir SOLO el cuerpo de la carta (2-4 párrafos), en el mismo idioma en que te llegó el contenido del candidato. NO incluyas saludo inicial (ej. "Dear Hiring Team" / "Estimados señores") ni despedida ni firma -- eso lo agrega el sistema por separado con una plantilla.

Reglas:
- Párrafo 1: quién es el candidato y por qué le interesa esta vacante/empresa específica (usa detalles reales de la descripción de la vacante, no genéricos).
- Párrafo(s) intermedio(s): 2-3 logros o experiencias concretas del candidato que conectan directamente con los requisitos de la vacante -- sin inventar logros, tecnologías o métricas que no estén en el contenido recibido.
- Párrafo final: cierre breve reafirmando interés y disposición a conversar más.
- Tono profesional pero natural, no genérico ni con clichés vacíos.
- Separa los párrafos con una línea en blanco. No uses markdown, viñetas, ni encabezados.
- Responde ÚNICAMENTE con el texto de la carta (los párrafos), sin explicaciones adicionales ni comillas envolventes.`;

export function buildCoverLetterUserPrompt(input: {
  candidateContentJson: string;
  jobDescription: string;
  jobAnalysisJson: string;
  company: string;
  role: string;
  language: "es" | "en";
}): string {
  return `Contenido disponible del candidato (JSON):
${input.candidateContentJson}

Empresa: ${input.company}
Puesto: ${input.role}

Análisis de la vacante (JSON):
${input.jobAnalysisJson}

Texto completo de la vacante:
${input.jobDescription}

IMPORTANTE: escribe el cuerpo completo de la carta en ${LANGUAGE_LABEL[input.language]}, sin importar en qué idioma esté escrito este mensaje o la vacante. No mezcles idiomas.

Escribe solo el cuerpo de la carta de presentación, siguiendo las reglas del system prompt.`;
}
