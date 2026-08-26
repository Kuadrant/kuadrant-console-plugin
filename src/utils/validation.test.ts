import {
  validateRequired,
  validateK8sName,
  validateK8sLabel,
  validatePort,
  validateNamespace,
} from './validation';

describe('validation utilities', () => {
  describe('validateRequired', () => {
    it('returns error for null', () => {
      expect(validateRequired(null)).toBe('This field is required');
    });

    it('returns error for undefined', () => {
      expect(validateRequired(undefined)).toBe('This field is required');
    });

    it('returns error for empty string', () => {
      expect(validateRequired('')).toBe('This field is required');
    });

    it('returns error for whitespace-only string', () => {
      expect(validateRequired('   ')).toBe('This field is required');
    });

    it('returns null for valid string', () => {
      expect(validateRequired('valid')).toBeNull();
    });

    it('returns null for string with leading/trailing spaces', () => {
      expect(validateRequired('  valid  ')).toBeNull();
    });
  });

  describe('validateK8sName', () => {
    it('returns null for valid names', () => {
      expect(validateK8sName('my-gateway')).toBeNull();
      expect(validateK8sName('route-123')).toBeNull();
      expect(validateK8sName('api.v1.service')).toBeNull();
      expect(validateK8sName('a')).toBeNull();
      expect(validateK8sName('test-route-v2')).toBeNull();
      expect(validateK8sName('name-with-dots.and-dashes')).toBeNull();
    });

    it('returns null for empty string (validateRequired should handle this)', () => {
      expect(validateK8sName('')).toBeNull();
    });

    it('returns error for uppercase letters', () => {
      expect(validateK8sName('My-Gateway')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for special characters', () => {
      expect(validateK8sName('route_test')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
      expect(validateK8sName('my route')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
      expect(validateK8sName('route@test')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for starting with hyphen', () => {
      expect(validateK8sName('-my-route')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for ending with hyphen', () => {
      expect(validateK8sName('my-route-')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for starting with period', () => {
      expect(validateK8sName('.my-route')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for ending with period', () => {
      expect(validateK8sName('my-route.')).toBe(
        'Name must consist of lowercase alphanumeric characters, "-", or ".", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for name longer than 253 characters', () => {
      const longName = 'a'.repeat(254);
      expect(validateK8sName(longName)).toBe('Name must be no more than 253 characters');
    });

    it('accepts name with exactly 253 characters', () => {
      const maxName = 'a'.repeat(253);
      expect(validateK8sName(maxName)).toBeNull();
    });
  });

  describe('validateK8sLabel', () => {
    it('returns null for valid labels', () => {
      expect(validateK8sLabel('http')).toBeNull();
      expect(validateK8sLabel('https-443')).toBeNull();
      expect(validateK8sLabel('listener-1')).toBeNull();
      expect(validateK8sLabel('a')).toBeNull();
      expect(validateK8sLabel('my-listener')).toBeNull();
    });

    it('returns null for empty string (validateRequired should handle this)', () => {
      expect(validateK8sLabel('')).toBeNull();
    });

    it('returns error for uppercase letters', () => {
      expect(validateK8sLabel('HTTPS')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for periods (not allowed in labels)', () => {
      expect(validateK8sLabel('http.listener')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for starting with hyphen', () => {
      expect(validateK8sLabel('-http')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for ending with hyphen', () => {
      expect(validateK8sLabel('http-')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );
    });

    it('returns error for label longer than 63 characters', () => {
      const longLabel = 'a'.repeat(64);
      expect(validateK8sLabel(longLabel)).toBe('Label must be no more than 63 characters');
    });

    it('accepts label with exactly 63 characters', () => {
      const maxLabel = 'a'.repeat(63);
      expect(validateK8sLabel(maxLabel)).toBeNull();
    });
  });

  describe('validatePort', () => {
    it('returns null for valid ports', () => {
      expect(validatePort(1)).toBeNull();
      expect(validatePort(80)).toBeNull();
      expect(validatePort(443)).toBeNull();
      expect(validatePort(8080)).toBeNull();
      expect(validatePort(65535)).toBeNull();
    });

    it('returns null for valid string ports', () => {
      expect(validatePort('80')).toBeNull();
      expect(validatePort('443')).toBeNull();
    });

    it('returns error for port 0', () => {
      expect(validatePort(0)).toBe('Port must be between 1 and 65535');
    });

    it('returns error for negative port', () => {
      expect(validatePort(-1)).toBe('Port must be between 1 and 65535');
    });

    it('returns error for port > 65535', () => {
      expect(validatePort(65536)).toBe('Port must be between 1 and 65535');
      expect(validatePort(100000)).toBe('Port must be between 1 and 65535');
    });

    it('returns error for non-numeric string', () => {
      expect(validatePort('abc')).toBe('Port must be a valid number');
    });

    it('returns error for NaN', () => {
      expect(validatePort(NaN)).toBe('Port must be a valid number');
    });

    it('returns error for fractional numbers', () => {
      expect(validatePort(1.5)).toBe('Port must be a valid number');
      expect(validatePort(8080.5)).toBe('Port must be a valid number');
    });

    it('returns error for partially numeric strings', () => {
      expect(validatePort('8080x')).toBe('Port must be a valid number');
      expect(validatePort('123abc')).toBe('Port must be a valid number');
    });

    it('returns error for malformed numeric string forms', () => {
      // Number() would coerce these to 80, 1, and 100 respectively — reject them.
      expect(validatePort('80abc')).toBe('Port must be a valid number');
      expect(validatePort('1.5')).toBe('Port must be a valid number');
      expect(validatePort('1e2')).toBe('Port must be a valid number');
    });
  });

  describe('validateNamespace', () => {
    it('uses DNS-1123 label rules (no dots allowed)', () => {
      // Valid cases
      expect(validateNamespace('my-namespace')).toBeNull();
      expect(validateNamespace('namespace-123')).toBeNull();

      // Invalid cases - uppercase
      expect(validateNamespace('My-Namespace')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );

      // Invalid cases - special chars (underscore)
      expect(validateNamespace('namespace_test')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );

      // Invalid cases - dots (namespace names cannot contain dots)
      expect(validateNamespace('team.prod')).toBe(
        'Label must consist of lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character',
      );

      // Invalid cases - length
      const longNs = 'a'.repeat(64);
      expect(validateNamespace(longNs)).toBe('Label must be no more than 63 characters');
    });
  });
});
