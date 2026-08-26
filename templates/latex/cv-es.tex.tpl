\documentclass[11pt]{article}

% Plantilla ATS-safe (sección 9.5): una columna, sin tablas, sin imágenes,
% sin color de fondo, sin iconos, fuente estándar, encabezados de sección
% simples, viñetas con itemize estándar.
\usepackage[margin=0.75in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{enumitem}
\usepackage{titlesec}

\pagestyle{empty}
\setlist[itemize]{leftmargin=1.1em, itemsep=1pt, topsep=2pt, parsep=0pt}
\titleformat{\section}{\large\bfseries}{}{0em}{}[\titlerule]
\titlespacing{\section}{0pt}{8pt}{4pt}
\setlength{\parindent}{0pt}

\begin{document}

\begin{center}
{\LARGE \textbf{{{FULL_NAME}}}}\\[2pt]
{{CONTACT_LINE}}
\end{center}

{{SUMMARY_SECTION}}
{{EXPERIENCE_SECTION}}
{{PROJECTS_SECTION}}
{{EDUCATION_SECTION}}
{{SKILLS_SECTION}}
{{LANGUAGES_SECTION}}
{{CERTIFICATIONS_SECTION}}
{{SOFT_SKILLS_SECTION}}
{{FOUNDED_COMPANIES_SECTION}}

\end{document}
