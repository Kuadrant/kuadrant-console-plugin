import { MatchLabel } from "src/components/dnspolicy/types";

// Helper function to remove undefined values from an object.
// Needed for yaml editor
export const removeUndefinedFields = (obj: any) => {
    return Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];
      if (value !== undefined) {
        acc[key] = typeof value === 'object' && !Array.isArray(value) ? removeUndefinedFields(value) : value;
      }
      return acc;
    }, {});
  };
  
  export const convertMatchLabelsArrayToObject = (matchLabelsArray: MatchLabel[]): { [key: string]: string } => {
    return matchLabelsArray.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {});
  };
  
  export const convertMatchLabelsObjectToArray = (matchLabelsObject: { [key: string]: string }): MatchLabel[] => {
    return Object.entries(matchLabelsObject).map(([key, value]) => ({ key, value }));
  };
  