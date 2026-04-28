import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardBody,
  CardTitle,
  Tabs,
  Tab,
  TabTitleText,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  ClipboardCopyButton,
  Spinner,
  Alert,
} from '@patternfly/react-core';
import {
  K8sResourceCommon,
  k8sGet,
  useK8sModel,
} from '@openshift-console/dynamic-plugin-sdk';
import { APIKey } from '../../utils/resources';
import { generateAuthCodeSnippets, AuthCodeSnippets } from '../../utils/generateAuthCodeSnippets';
import '../kuadrant.css';

interface APIProduct extends K8sResourceCommon {
  spec?: {
    gateway?: {
      hostname?: string;
    };
  };
}

interface UsageExamplesProps {
  apiKey: APIKey;
}

const UsageExamples: React.FC<UsageExamplesProps> = ({ apiKey }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTabKey, setActiveTabKey] = React.useState<string | number>(0);
  const [snippets, setSnippets] = React.useState<AuthCodeSnippets | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [copied, setCopied] = React.useState<{ [key: number]: boolean }>({});

  const [apiProductModel] = useK8sModel({
    group: 'devportal.kuadrant.io',
    version: 'v1alpha1',
    kind: 'APIProduct',
  });

  const namespace = apiKey.metadata.namespace || '';
  const apiProductName = apiKey.spec?.apiProductRef?.name || '';

  const handleCopy = (tabKey: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [tabKey]: true });
    setTimeout(() => {
      setCopied({ ...copied, [tabKey]: false });
    }, 2000);
  };

  React.useEffect(() => {
    const fetchData = async () => {
      if (!apiProductModel || !namespace || !apiProductName || apiKey.status?.phase !== 'Approved') {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const apiProduct = await k8sGet<APIProduct>({
          model: apiProductModel,
          name: apiProductName,
          ns: namespace,
        });

        const hostname = apiProduct.spec?.gateway?.hostname || 'api.example.com';
        const placeholderKey = 'YOUR_API_KEY';

        const codeSnippets = generateAuthCodeSnippets(placeholderKey, hostname);
        setSnippets(codeSnippets);
      } catch (err) {
        console.error('Error fetching data for usage examples:', err);
        setError(t('Failed to load usage examples'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiProductModel, namespace, apiProductName, apiKey.status?.phase, t]);

  const handleTabClick = (
    _event: React.MouseEvent<HTMLElement, MouseEvent>,
    tabIndex: string | number,
  ) => {
    setActiveTabKey(tabIndex);
  };

  if (apiKey.status?.phase !== 'Approved') {
    return null;
  }

  if (loading) {
    return (
      <Card isCompact>
        <CardTitle>{t('Usage Examples')}</CardTitle>
        <CardBody>
          <Spinner size="lg" />
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card isCompact>
        <CardTitle>{t('Usage Examples')}</CardTitle>
        <CardBody>
          <Alert variant="danger" title={error} isInline />
        </CardBody>
      </Card>
    );
  }

  if (!snippets) {
    return null;
  }

  return (
    <Card isCompact>
      <CardTitle>{t('Usage Examples')}</CardTitle>
      <CardBody>
        <Tabs activeKey={activeTabKey} onSelect={handleTabClick} aria-label="Code examples tabs">
          <Tab eventKey={0} title={<TabTitleText>cURL</TabTitleText>}>
            <div style={{ marginTop: '16px' }}>
              <CodeBlock>
                <CodeBlockAction>
                  <ClipboardCopyButton
                    id="copy-curl"
                    textId="code-curl"
                    aria-label={t('Copy to clipboard')}
                    onClick={() => handleCopy(0, snippets.curl)}
                    exitDelay={2000}
                    variant="plain"
                  >
                    {copied[0] ? t('Copied') : t('Copy')}
                  </ClipboardCopyButton>
                </CodeBlockAction>
                <CodeBlockCode id="code-curl">{snippets.curl}</CodeBlockCode>
              </CodeBlock>
            </div>
          </Tab>
          <Tab eventKey={1} title={<TabTitleText>Node.js</TabTitleText>}>
            <div style={{ marginTop: '16px' }}>
              <CodeBlock>
                <CodeBlockAction>
                  <ClipboardCopyButton
                    id="copy-nodejs"
                    textId="code-nodejs"
                    aria-label={t('Copy to clipboard')}
                    onClick={() => handleCopy(1, snippets.nodejs)}
                    exitDelay={2000}
                    variant="plain"
                  >
                    {copied[1] ? t('Copied') : t('Copy')}
                  </ClipboardCopyButton>
                </CodeBlockAction>
                <CodeBlockCode id="code-nodejs">{snippets.nodejs}</CodeBlockCode>
              </CodeBlock>
            </div>
          </Tab>
          <Tab eventKey={2} title={<TabTitleText>Python</TabTitleText>}>
            <div style={{ marginTop: '16px' }}>
              <CodeBlock>
                <CodeBlockAction>
                  <ClipboardCopyButton
                    id="copy-python"
                    textId="code-python"
                    aria-label={t('Copy to clipboard')}
                    onClick={() => handleCopy(2, snippets.python)}
                    exitDelay={2000}
                    variant="plain"
                  >
                    {copied[2] ? t('Copied') : t('Copy')}
                  </ClipboardCopyButton>
                </CodeBlockAction>
                <CodeBlockCode id="code-python">{snippets.python}</CodeBlockCode>
              </CodeBlock>
            </div>
          </Tab>
          <Tab eventKey={3} title={<TabTitleText>Go</TabTitleText>}>
            <div style={{ marginTop: '16px' }}>
              <CodeBlock>
                <CodeBlockAction>
                  <ClipboardCopyButton
                    id="copy-go"
                    textId="code-go"
                    aria-label={t('Copy to clipboard')}
                    onClick={() => handleCopy(3, snippets.go)}
                    exitDelay={2000}
                    variant="plain"
                  >
                    {copied[3] ? t('Copied') : t('Copy')}
                  </ClipboardCopyButton>
                </CodeBlockAction>
                <CodeBlockCode id="code-go">{snippets.go}</CodeBlockCode>
              </CodeBlock>
            </div>
          </Tab>
        </Tabs>
      </CardBody>
    </Card>
  );
};

export default UsageExamples;
