import threading
from urllib.parse import urlparse
from opensearchpy import OpenSearch

from fastapi_backend.config import settings

_client_lock = threading.Lock()
_opensearch_client: OpenSearch | None = None


def create_opensearch_client() -> OpenSearch:
    """Instantiate a synchronous OpenSearch client from application settings."""
    url = settings.opensearch_url
    user = settings.opensearch_user
    password = settings.opensearch_password

    parsed = urlparse(url)
    if not user and parsed.username:
        user = parsed.username
    if not password and parsed.password:
        password = parsed.password

    # Clean host without embedded credentials for the hosts parameter
    if parsed.username or parsed.password:
        netloc = parsed.hostname or "localhost"
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        clean_url = f"{parsed.scheme}://{netloc}"
    else:
        clean_url = url

    http_auth = (user, password) if user and password else None

    return OpenSearch(
        hosts=[clean_url],
        http_auth=http_auth,
        use_ssl=parsed.scheme == "https",
        verify_certs=True,
        timeout=settings.opensearch_timeout,
        max_retries=1,
        retry_on_timeout=False,
    )


def get_opensearch_client() -> OpenSearch:
    """Return the cached OpenSearch client or initialize it lazily."""
    global _opensearch_client
    if _opensearch_client is None:
        with _client_lock:
            if _opensearch_client is None:
                _opensearch_client = create_opensearch_client()
    return _opensearch_client


def override_opensearch_client(client: OpenSearch | None) -> None:
    """Override the OpenSearch client instance (primarily for testing)."""
    global _opensearch_client
    with _client_lock:
        _opensearch_client = client
