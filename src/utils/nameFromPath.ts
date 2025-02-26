/**
 * Dynamically extracts the resource name from an OpenShift Console URL.
 *
 * Extracts resources names from a console path
 * Matches  "<group>~v<version>~<kind>"
 * and returns the following segment as the resource name.
 *
 * given:
 *   '/k8s/ns/toystore-1/gateway.networking.k8s.io~v1~HTTPRoute/toystore/policies'
 *
 * it will return "toystore", regardless of resource GVK.
 */
const extractResourceNameFromURL = (pathname: string): string | null => {
  const pathSegments = pathname.split('/');

  // match "<group>~v<version>~<kind>"
  const resourceIndex = pathSegments.findIndex((segment) => /^.+~v\d+~.+$/.test(segment));

  if (resourceIndex !== -1 && resourceIndex + 1 < pathSegments.length) {
    return pathSegments[resourceIndex + 1];
  }

  return null;
};

export default extractResourceNameFromURL;
