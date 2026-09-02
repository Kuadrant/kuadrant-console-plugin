// "incidentId" and "incident_id" both read as "Incident id" in a form label
export const humanize = (value: string): string => {
  const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
