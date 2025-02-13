# Understanding Policy Status Labels

Kuadrant uses a series of checks to determine the health and state of a policy. In our UI plugin for OpenShift, these multiple checks—called **Conditions**—are "compressed" into one **meta-status** label. This label gives you an at-a-glance summary of whether your policy is working as expected or if there are issues to be aware of.

## Conditions vs. Status

Before diving into the labels, it’s important to understand the relationship between **Conditions** and **Status**:

- **Conditions:**  
  A **Condition** is a granular indicator that reflects a specific aspect of a policy’s lifecycle or health. Each condition is an object with key attributes such as:
  - **Type:** The name of the condition (e.g., `Accepted`, `Enforced`, `Conflicted`).
  - **Status:** Typically a Boolean value (`True` or `False`) indicating whether that particular aspect is in a good state.
  - **Reason & Message:** Additional details explaining the state (for example, why a policy might be marked as `Conflicted` or `Invalid`).

  Conditions provide detailed diagnostic information that are useful to determine why a policy is in a given Status.

- **Status:**  
  The **Status** is the overall state of the policy, which is represented as a collection of conditions. In the context of our UI, the **Status** and **Conditions** are "compressed" into a single label that aggregates the various conditions into single status for a policy. This meta-status label is easier to read at a glance and quickly informs you whether the policy is fully operational, partially enforced, or experiencing errors.

Conditions and Status for policies can be viewed in detail on the Policy resource pages, but in our lists views, we compress them into one label for ease of use and ease to scan.

## How It Works

When you create or update a policy, the system goes through several stages:

1. **Validation & Reconciliation:**  
   The Kuadrant Operator checks a policy to ensure its specification is correct and that it can be properly applied.  
   - **Condition Example:** A condition of type `Accepted` might be set to `True` if the policy passes validation, or to `False` with a reason such as `Invalid` if it fails.

2. **Enforcement:**  
   The policy is then pushed to the relevant Kuadrant component (for example, Authorino for authentication or Limitador for rate limiting), and become `Enforced` once a policy is in place and is being actively applied & enforced.
   - **Condition Example:** An `Enforced` condition will be marked as `True` when the policy is successfully applied. If there are issues (such as overlaps with other policies), conditions like `PartiallyEnforced` or `Overridden` might be set.

3. **Error Detection:**  
   Throughout these processes, if any issues occur (for instance, conflicts or missing targets), these are captured as conditions.
   
In our list views, the plugin then inspects all these conditions, compressing them into one status label that reflects the overall state of your policy.

## What the Labels Mean

Below is a summary of each meta-status label, including its color, icon, and what it signifies:

| **Label**                        | **Color & Icon**                           | **Meaning**                                                                                                            |
|----------------------------------|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| **Enforced**                     | **Green** with a checkmark icon            | The resource is **accepted, programmed, and all policies are enforced**. Everything is working as expected.            |
| **Accepted (Not Enforced)**      | **Purple** with an upload icon             | The resource has been accepted but **not all policies are enforced**. This might indicate that enforcement is pending or there are minor issues. |
| **Programmed**                   | **Blue** with a checkmark icon             | The resource is in the process of being set up (programmed) but **is not yet enforced**.               |
| **Conflicted**                   | **Red** with an exclamation icon           | There is a **conflict** on the resource - possibly due to conflicting policies or configuration issues.                   |
| **Resolved Refs**                | **Blue** with a checkmark icon             | All required references (dependencies) for the policy have been **successfully resolved**.                              |
| **Creating**                     | **Cyan** with an hourglass icon            | The resource is **currently being created**. Not enough information is available yet to provide a final status.          |
| **Overridden (Not Enforced)**    | **Grey** with a layered icon               | The resource is **overridden by another configuration** and, as a result, is not actively enforced.                     |
| **Conflicted (Not Accepted)**    | **Red** with an exclamation icon           | A conflict exists, and the resource is **not accepted** by the system.                                                 |
| **TargetNotFound (Not Accepted)**| **Red** with an exclamation icon           | The target for the policy (for example, a referenced service) was **not found** so the policy isn’t accepted.             |
| **Unknown (Not Accepted)**       | **Orange** with an exclamation icon        | The system is unable to determine a clear state for the resource, indicating an **error or incomplete status**.          |
| **Invalid (Not Accepted)**       | **Red** with an exclamation icon           | The resource is **invalid** (for example, it failed validation) and is not accepted by the system.                       |

> **Note:**  
> - **Accepted** means the policy has passed initial validation and reconciliation.  
> - **Enforced** means the policy is not only accepted but also actively enforced by Kuadrant.  
> - Error states such as **Conflicted**, **TargetNotFound**, or **Invalid** indicate that there is an issue preventing the policy from being fully accepted and enforced.

## Behind the Scenes: Decision Logic

The helper function in the console plugin that generates these compressed labels follows this general logic:

1. **Resource Type Check:**  
   The system first checks the kind of resource (e.g., a Gateway) to decide which set of policy conditions should be considered.

2. **Primary Conditions (for Gateways):**  
   - If both the **Accepted** and **Programmed** conditions are met, the function then checks whether all associated policies are successfully enforced.  
     - If yes, it shows **Enforced**.
     - If not, it shows **Accepted (Not Enforced)**.
   - If only **Programmed** is set, it shows **Programmed**.
   - If there’s a **Conflicted** condition or if references have been **Resolved**, the corresponding label is shown.

3. **Additional Checks for Other Resources:**  
   - For resources with related (or parent) policies, the function examines conditions inherited from those parent objects.
   - The same checks apply: if everything is accepted and enforced, you see **Enforced**; if not, you might see **Accepted (Not Enforced)** or one of the error labels (e.g., **Conflicted (Not Accepted)**).

4. **General Fallbacks:**  
   - If no conditions are reported (for example, while the resource is still being created), the label **Creating** is used.
   - If none of the specific conditions match, the system defaults to showing **Unknown** to signal that the status is unclear.

## References

For further details on the guidelines we follow for status and conditions, please refer to the following proposals which we adhere to:

- [Policy Status RFC](https://github.com/Kuadrant/architecture/pull/9)
- [GEP-713: Gateway API Conditions](https://gateway-api.sigs.k8s.io/geps/gep-713/#conditions)
- [Kubernetes API Conventions](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#spec-and-status)
