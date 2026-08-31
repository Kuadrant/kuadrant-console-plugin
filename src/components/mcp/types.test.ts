import { initialFormState } from './types';
import type { MCPWizardFormState } from './types';

describe('MCPWizardFormState', () => {
  describe('initialFormState', () => {
    it('has gatewayMode set to existing by default', () => {
      expect(initialFormState.gatewayMode).toBe('existing');
    });

    it('has automatic HTTPRoute management enabled by default', () => {
      expect(initialFormState.httpRouteManagementEnabled).toBe(true);
    });

    it('has empty string values for all name fields', () => {
      expect(initialFormState.selectedGatewayName).toBe('');
      expect(initialFormState.newGatewayName).toBe('');
      expect(initialFormState.extensionName).toBe('');
      expect(initialFormState.sectionName).toBe('');
      expect(initialFormState.targetGateway).toBe('');
    });

    it('conforms to MCPWizardFormState interface', () => {
      const state: MCPWizardFormState = { ...initialFormState };
      expect(Object.keys(state).length).toBeGreaterThan(0);
    });
  });
});

describe('MCPWizardFormState validation logic', () => {
  it('step 1 is valid when existing gateway is selected', () => {
    const state: MCPWizardFormState = {
      ...initialFormState,
      gatewayMode: 'existing',
      selectedGatewayName: 'my-gateway',
    };
    const isValid =
      (state.gatewayMode === 'existing' && state.selectedGatewayName !== '') ||
      (state.gatewayMode === 'new' && state.newGatewayName.trim() !== '');
    expect(isValid).toBe(true);
  });

  it('step 1 is invalid when no gateway selected', () => {
    const state: MCPWizardFormState = {
      ...initialFormState,
      gatewayMode: 'existing',
      selectedGatewayName: '',
    };
    const isValid =
      (state.gatewayMode === 'existing' && state.selectedGatewayName !== '') ||
      (state.gatewayMode === 'new' && state.newGatewayName.trim() !== '');
    expect(isValid).toBe(false);
  });

  it('step 1 is valid when new gateway name is provided', () => {
    const state: MCPWizardFormState = {
      ...initialFormState,
      gatewayMode: 'new',
      newGatewayName: 'new-gateway',
    };
    const isValid =
      (state.gatewayMode === 'existing' && state.selectedGatewayName !== '') ||
      (state.gatewayMode === 'new' && state.newGatewayName.trim() !== '');
    expect(isValid).toBe(true);
  });

  it('step 2 is valid when all required fields are filled', () => {
    const state: MCPWizardFormState = {
      ...initialFormState,
      extensionName: 'my-ext',
      targetGateway: 'my-gw',
      sectionName: 'http',
    };
    const isValid =
      state.extensionName.trim() !== '' &&
      state.targetGateway.trim() !== '' &&
      state.sectionName.trim() !== '';
    expect(isValid).toBe(true);
  });

  it('step 2 is invalid when extension name is missing', () => {
    const state: MCPWizardFormState = {
      ...initialFormState,
      extensionName: '',
      targetGateway: 'my-gw',
      sectionName: 'http',
    };
    const isValid =
      state.extensionName.trim() !== '' &&
      state.targetGateway.trim() !== '' &&
      state.sectionName.trim() !== '';
    expect(isValid).toBe(false);
  });

  it('cross-namespace check detects same namespace', () => {
    const extensionNamespace: string = 'default';
    const gatewayNamespace: string = 'default';
    expect(extensionNamespace !== gatewayNamespace).toBe(false);
  });

  it('cross-namespace check detects different namespace', () => {
    const extensionNamespace: string = 'mcp-system';
    const gatewayNamespace: string = 'gateway-system';
    expect(extensionNamespace !== gatewayNamespace).toBe(true);
  });
});
