% Plantilla VISUAL secundaria y opcional (sección 3, punto 2 del documento de
% arquitectura): con foto, tipografía e iconos -- NO es ATS-safe. Se ofrece
% solo para enviar directo a un humano cuando el usuario lo elige a propósito.
% Basada en la clase "documentMETADATA" (adaptada de un derivado de Awesome-CV
% aportado por el usuario, corregido para compilar con tectonic/XeTeX).
%
% Requiere que documentMETADATA.cls, la carpeta fonts/, y (si hay foto) el
% archivo de imagen estén copiados en el mismo directorio que este .tex antes
% de compilar -- ver web/lib/latex/render-visual.ts (prepareVisualAssets).
\documentclass[localFont,alternative]{documentMETADATA}

\name{{{FIRST_NAME}}}{{{LAST_NAME}}}
\tagline{{{HEADLINE}}}
{{PHOTO_COMMAND}}
\socialinfo{
{{SOCIAL_INFO}}
}

\begin{document}

\makecvheader

{{SUMMARY_SECTION}}
\par\medskip
{{EXPERIENCE_SECTION}}
\par\medskip
{{PROJECTS_SECTION}}
\par\medskip
{{EDUCATION_SECTION}}
\par\medskip
{{SKILLS_SECTION}}
\par\medskip
{{LANGUAGES_SECTION}}
\par\medskip
{{CERTIFICATIONS_SECTION}}
\par\medskip
{{SOFT_SKILLS_SECTION}}
\par

\end{document}
