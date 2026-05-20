# Cloud permission request checklist

## Cloudflare account

Ask for:

- Account access as `Super Administrator` or `Account Owner` during setup.
- DNS control for the project domain.
- Billing access for Cloudflare Developer Platform products.
- Ability to create API tokens scoped to the project account and zone.

## Cloudflare products

Request access to:

- Workers
- Pages
- R2
- D1
- Workers KV
- Durable Objects
- Queues
- Turnstile
- WAF, DDoS, DNS, SSL/TLS, Cache
- Optional reserve: Workers AI, AI Gateway, Vectorize, Images, Stream

## Cloudflare CI/CD API token

Scope the token to the project account and project zone only.

Account permissions:

- `Workers Scripts Write/Edit`
- `Pages Write/Edit`
- `Workers R2 Storage Write/Edit`
- `D1 Write/Edit`
- `Workers KV Storage Write/Edit`
- `Queues Write/Edit`
- `Workers Tail Read`
- `Account Analytics Read`
- Optional: `Workers AI Write/Edit`, `AI Gateway Write/Edit`, `Vectorize Write/Edit`, `Images Write/Edit`

Zone permissions:

- `DNS Write/Edit`
- `Zone Settings Write/Edit`
- `SSL and Certificates Write/Edit`
- `Cache Purge`
- `Zone WAF Write/Edit`
- `Analytics Read`
- `Workers Routes Write/Edit`

## AWS fallback account

Ask for:

- Project-level AWS account or project-level IAM role.
- S3 bucket creation and configuration during setup.
- IAM policy/role management for this project only.
- CloudTrail and CloudWatch for audit/logging.
- KMS only if backup data needs customer-managed encryption keys.
- Optional reserve: SQS, Lambda, ECS/Fargate.

## AWS buckets

- `xtbit-apps-dev-backup`
- `xtbit-apps-prod-backup`
- `xtbit-apps-prod-archive`

## AWS runtime IAM policy shape

Allow only these bucket actions for the project buckets:

- `s3:ListBucket`
- `s3:GetBucketLocation`

Allow only these object actions for objects in the project buckets:

- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject`
- `s3:AbortMultipartUpload`

If KMS is enabled:

- `kms:Encrypt`
- `kms:Decrypt`
- `kms:GenerateDataKey`

Temporary setup-only permissions:

- `s3:CreateBucket`
- `s3:PutBucketCors`
- `s3:PutBucketPolicy`
- `s3:PutLifecycleConfiguration`
- `s3:PutBucketVersioning`

## Sources

- Cloudflare API token permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- AWS S3 IAM examples: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_examples_s3_rw-bucket.html
- AWS S3 presigned URLs: https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html
