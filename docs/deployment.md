# SkyRoute Cloud Run deployment

- GitHub: https://github.com/KickboxerJ0322/SkyRoute
- Google Cloud project: jumpeicloud
- Region: asia-northeast1 (Tokyo)
- Cloud Run service: skyroute
- Runtime identity: skyroute-runtime@jumpeicloud.iam.gserviceaccount.com
- Public URL: https://skyroute-331230486346.asia-northeast1.run.app

The cloudbuild.yaml pipeline builds and tests the application, pushes an image tagged with the build ID to Artifact Registry, and deploys Cloud Run. The main branch is the production branch. Cloud Build trigger skyroute-main in asia-northeast1 watches ^main$ through the existing terminalbox-github connection, with a dedicated skyroute repository registration.

Secret Manager supplies skyroute-maps-browser-key at build time and skyroute-aeroapi-key at runtime. The Maps browser key is deliberately included in browser JavaScript and restricted to the SkyRoute production URLs and Maps JavaScript API. The AeroAPI key is never included in the build context or frontend assets. Local .env files are excluded from Git, Docker, and Cloud Build uploads.

Cloud Run scales from zero to one instance, with 512 MiB memory and one CPU. API caches and the external call limit (20/minute) are per instance. The call limit is not a monthly spending cap. LIVE data updates may incur FlightAware and Google Maps charges.

To deploy manually with the configured secrets:

    gcloud builds submit --project=jumpeicloud --config=cloudbuild.yaml --service-account=projects/jumpeicloud/serviceAccounts/331230486346-compute@developer.gserviceaccount.com

For routine changes, push to main after local tests. Inspect the Cloud Build result and Cloud Run revision before considering deployment complete. Roll back through Cloud Run revision traffic if needed; do not force-push Git history.

Health endpoint: /api/health (does not call FlightAware).

Production smoke check (uses live APIs):

    $env:SKYROUTE_PRODUCTION_URL="https://skyroute-331230486346.asia-northeast1.run.app"
    node tests/production-check.mjs
