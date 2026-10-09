import os
import re
import io
import shutil
import tempfile
import urllib.parse
from typing import Tuple, List, Optional, Dict, Any
from fastapi import HTTPException, status
import polars as pl
import httpx
from app.config import settings
from app.engine.reader import DataReader

SUPPORTED_EXTENSIONS = {".csv", ".parquet", ".json", ".xlsx", ".xls", ".txt"}


class DatasetImportError(HTTPException):
    def __init__(self, status_code: int, detail: str):
        super().__init__(status_code=status_code, detail=detail)


class DatasetImporter:
    @staticmethod
    def parse_kaggle_identifier(url_or_id: str) -> str:
        """
        Parses and validates a Kaggle URL or identifier.
        Supports:
          - https://www.kaggle.com/datasets/username/dataset-name
          - https://kaggle.com/datasets/username/dataset-name
          - username/dataset-name
        Prevents SSRF and path traversal.
        """
        raw = (url_or_id or "").strip()
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kaggle URL or identifier cannot be empty."
            )

        if "://" in raw or raw.startswith("//"):
            try:
                parsed = urllib.parse.urlparse(raw)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Kaggle URL format."
                )

            # SSRF prevention: ensure host is strictly kaggle.com or www.kaggle.com
            host = (parsed.hostname or "").lower()
            if host not in ("kaggle.com", "www.kaggle.com"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid Kaggle domain: '{host}'. Only kaggle.com URLs are accepted."
                )

            # Path format: /datasets/{owner}/{dataset_name}
            path_parts = [p for p in parsed.path.strip("/").split("/") if p]
            if len(path_parts) >= 3 and path_parts[0] == "datasets":
                owner, dataset_slug = path_parts[1], path_parts[2]
            elif len(path_parts) == 2 and path_parts[0] != "datasets":
                owner, dataset_slug = path_parts[0], path_parts[1]
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Kaggle URL structure. Expected 'https://www.kaggle.com/datasets/username/dataset-name'."
                )
            identifier = f"{owner}/{dataset_slug}"
        else:
            identifier = raw.strip("/")

        # Validation regex for Kaggle identifier: username/dataset-slug
        if not re.match(r"^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$", identifier):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Kaggle identifier format. Expected 'username/dataset-name'."
            )

        if ".." in identifier or "\\" in identifier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid characters detected in Kaggle dataset identifier."
            )

        return identifier

    @staticmethod
    def parse_huggingface_identifier(url_or_id: str) -> str:
        """
        Parses and validates a Hugging Face URL or repository identifier.
        Supports:
          - https://huggingface.co/datasets/username/dataset-name
          - https://www.huggingface.co/datasets/username/dataset-name
          - username/dataset-name
          - dataset-name (for root datasets)
        Prevents SSRF and path traversal.
        """
        raw = (url_or_id or "").strip()
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hugging Face URL or identifier cannot be empty."
            )

        if "://" in raw or raw.startswith("//"):
            try:
                parsed = urllib.parse.urlparse(raw)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Hugging Face URL format."
                )

            # SSRF prevention: ensure host is strictly huggingface.co or www.huggingface.co
            host = (parsed.hostname or "").lower()
            if host not in ("huggingface.co", "www.huggingface.co"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid Hugging Face domain: '{host}'. Only huggingface.co URLs are accepted."
                )

            path_parts = [p for p in parsed.path.strip("/").split("/") if p]
            if not path_parts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Hugging Face URL path."
                )

            if path_parts[0] == "datasets":
                path_parts = path_parts[1:]

            if len(path_parts) == 1:
                repo_id = path_parts[0]
            elif len(path_parts) >= 2:
                repo_id = f"{path_parts[0]}/{path_parts[1]}"
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Hugging Face dataset URL. Expected 'https://huggingface.co/datasets/username/dataset-name'."
                )
        else:
            repo_id = raw.strip("/")

        # Validation regex for HF repository ID
        if not re.match(r"^([a-zA-Z0-9_-]+/)?([a-zA-Z0-9_.-]+)$", repo_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Hugging Face repository identifier format."
            )

        if ".." in repo_id or "\\" in repo_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid characters detected in Hugging Face repository identifier."
            )

        return repo_id

    @classmethod
    def get_kaggle_api(cls):
        """
        Verifies credentials and returns an authenticated KaggleApi instance.
        """
        username = os.environ.get("KAGGLE_USERNAME") or settings.KAGGLE_USERNAME
        key = os.environ.get("KAGGLE_KEY") or settings.KAGGLE_KEY
        token = os.environ.get("KAGGLE_API_TOKEN") or settings.KAGGLE_API_TOKEN

        kaggle_json = os.path.expanduser("~/.kaggle/kaggle.json")
        access_token_file = os.path.expanduser("~/.kaggle/access_token")

        has_creds = (username and key) or token or os.path.exists(kaggle_json) or os.path.exists(access_token_file)
        if not has_creds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kaggle API credentials are not configured on the server. Please configure KAGGLE_USERNAME and KAGGLE_KEY (or KAGGLE_API_TOKEN) in environment variables to import Kaggle datasets."
            )

        if username and "KAGGLE_USERNAME" not in os.environ:
            os.environ["KAGGLE_USERNAME"] = username
        if key and "KAGGLE_KEY" not in os.environ:
            os.environ["KAGGLE_KEY"] = key
        if token and "KAGGLE_API_TOKEN" not in os.environ:
            os.environ["KAGGLE_API_TOKEN"] = token

        try:
            from kaggle.api.kaggle_api_extended import KaggleApi
            api = KaggleApi()
            api.authenticate()
            return api
        except SystemExit:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Kaggle authentication failed. Please check your Kaggle API credentials."
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to connect to the Kaggle API: {str(e)}"
            )

    @classmethod
    def import_kaggle_dataset(
        cls,
        url_or_id: str,
        custom_name: Optional[str] = None
    ) -> Tuple[pl.DataFrame, bytes, str, str, str, str]:
        """
        Downloads a dataset from Kaggle via the official Kaggle API and extracts tabular content.
        Returns: (df, raw_content, filename, format_ext, dataset_name, identifier)
        """
        identifier = cls.parse_kaggle_identifier(url_or_id)
        api = cls.get_kaggle_api()

        temp_dir = tempfile.mkdtemp(prefix="dataforge_kaggle_")
        try:
            try:
                api.dataset_download_files(dataset=identifier, path=temp_dir, unzip=True, quiet=True)
            except SystemExit:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"The Kaggle dataset '{identifier}' could not be found or access is unauthorized. Please verify the URL and permissions."
                )
            except Exception as e:
                err_msg = str(e).lower()
                if "404" in err_msg or "not found" in err_msg:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"The Kaggle dataset '{identifier}' could not be found. Please check the URL and try again."
                    )
                if "403" in err_msg or "unauthorized" in err_msg or "forbidden" in err_msg:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Unable to access the Kaggle dataset '{identifier}'. The dataset may be private or requires accepted competition rules."
                    )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to download Kaggle dataset '{identifier}': {str(e)}"
                )

            # Discover downloaded files
            discovered_files = []
            for root, _, files in os.walk(temp_dir):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in SUPPORTED_EXTENSIONS:
                        full_path = os.path.join(root, f)
                        size = os.path.getsize(full_path)
                        discovered_files.append((full_path, f, ext, size))

            if not discovered_files:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No supported tabular data files (CSV, Parquet, JSON, XLSX) were found in the Kaggle dataset '{identifier}'."
                )

            # Select the most suitable file:
            # 1. Matches dataset name slug
            # 2. train.csv / data.csv
            # 3. Largest supported file
            dataset_slug = identifier.split("/")[-1].lower()
            selected = None

            for full_path, f, ext, size in discovered_files:
                base_name = os.path.splitext(f)[0].lower()
                if base_name == dataset_slug:
                    selected = (full_path, f, ext, size)
                    break

            if not selected:
                for full_path, f, ext, size in discovered_files:
                    base_name = os.path.splitext(f)[0].lower()
                    if base_name in ("train", "data", "dataset"):
                        selected = (full_path, f, ext, size)
                        break

            if not selected:
                discovered_files.sort(key=lambda x: x[3], reverse=True)
                selected = discovered_files[0]

            chosen_path, chosen_name, chosen_ext, chosen_size = selected

            max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
            if chosen_size > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Dataset file '{chosen_name}' ({chosen_size // (1024 * 1024)}MB) exceeds the maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB."
                )

            with open(chosen_path, "rb") as f:
                content = f.read()

            if not content or len(content.strip()) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"The downloaded file '{chosen_name}' is empty."
                )

            # Read via DataReader
            try:
                df = DataReader.read_to_polars(content, chosen_name)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to parse dataset file '{chosen_name}': {str(e)}"
                )

            dataset_name = (
                custom_name.strip()
                if custom_name and custom_name.strip()
                else identifier.split("/")[-1].replace("-", " ").replace("_", " ").title()
            )
            raw_format = chosen_ext.lstrip(".")
            if raw_format == "txt":
                raw_format = "csv"

            return df, content, chosen_name, raw_format, dataset_name, identifier

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    @classmethod
    def fetch_huggingface_splits(cls, url_or_id: str) -> Dict[str, Any]:
        """
        Fetches available splits and repository metadata for a Hugging Face dataset.
        Uses datasets-server REST API with graceful fallback to the datasets library.
        """
        repo_id = cls.parse_huggingface_identifier(url_or_id)

        splits: List[str] = []
        # Attempt 1: Fast Hugging Face datasets-server REST API
        try:
            api_url = f"https://datasets-server.huggingface.co/splits?dataset={repo_id}"
            headers = {}
            if settings.HF_TOKEN:
                headers["Authorization"] = f"Bearer {settings.HF_TOKEN}"

            with httpx.Client(timeout=6.0) as client:
                res = client.get(api_url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    raw_splits = [item.get("split") for item in data.get("splits", []) if item.get("split")]
                    # Deduplicate while preserving order
                    seen = set()
                    for s in raw_splits:
                        if s not in seen:
                            seen.add(s)
                            splits.append(s)
                elif res.status_code == 404:
                    # Could be renamed or not in datasets-server cache; fallback to datasets library
                    pass
                elif res.status_code in (401, 403):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"This Hugging Face dataset '{repo_id}' is private or gated. An authenticated HF_TOKEN is required."
                    )
        except HTTPException:
            raise
        except Exception:
            # Continue to fallback
            pass

        # Attempt 2: Fallback to official datasets inspect / get_dataset_split_names
        if not splits:
            try:
                from datasets import get_dataset_split_names
                splits = get_dataset_split_names(repo_id, token=settings.HF_TOKEN)
            except Exception as e:
                err_str = str(e).lower()
                ex_name = type(e).__name__.lower()
                if "notfound" in ex_name or "not found" in err_str or "doesn't exist" in err_str or "does not exist" in err_str or "404" in err_str:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"The Hugging Face dataset '{repo_id}' could not be found. Please check the repository identifier and try again."
                    )
                if "gated" in err_str or "unauthorized" in err_str or "401" in err_str or "403" in err_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"The Hugging Face dataset '{repo_id}' is gated or private. Please provide a valid HF_TOKEN in server configuration."
                    )
                # Fallback to standard splits if cannot inspect
                splits = ["train"]

        if not splits:
            splits = ["train"]

        default_split = "train" if "train" in splits else splits[0]
        suggested_name = repo_id.split("/")[-1].replace("-", " ").replace("_", " ").title()

        return {
            "repository": repo_id,
            "splits": splits,
            "default_split": default_split,
            "suggested_name": suggested_name
        }

    @classmethod
    def import_huggingface_dataset(
        cls,
        url_or_id: str,
        split: Optional[str] = None,
        custom_name: Optional[str] = None
    ) -> Tuple[pl.DataFrame, bytes, str, str, str, str, str]:
        """
        Loads a dataset from Hugging Face Hub using the datasets library.
        Returns: (df, raw_parquet_bytes, filename, format_ext, dataset_name, repo_id, split)
        """
        repo_id = cls.parse_huggingface_identifier(url_or_id)

        try:
            from datasets import load_dataset, DatasetDict
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The 'datasets' package is not installed on the server."
            )

        chosen_split = (split or "").strip() or None

        try:
            if chosen_split:
                ds = load_dataset(repo_id, split=chosen_split, token=settings.HF_TOKEN)
                resolved_split = chosen_split
            else:
                loaded = load_dataset(repo_id, token=settings.HF_TOKEN)
                if isinstance(loaded, DatasetDict):
                    available_splits = list(loaded.keys())
                    resolved_split = "train" if "train" in available_splits else available_splits[0]
                    ds = loaded[resolved_split]
                else:
                    resolved_split = "default"
                    ds = loaded
        except Exception as e:
            err_str = str(e).lower()
            ex_name = type(e).__name__.lower()
            if "notfound" in ex_name or "not found" in err_str or "doesn't exist" in err_str or "does not exist" in err_str or "404" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"The Hugging Face dataset '{repo_id}' could not be found. Please check the repository identifier and try again."
                )
            if "gated" in err_str or "unauthorized" in err_str or "401" in err_str or "403" in err_str:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"The Hugging Face dataset '{repo_id}' is gated or private. Please provide a valid HF_TOKEN in server configuration."
                )
            if "split" in err_str and chosen_split:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Split '{chosen_split}' not found in Hugging Face dataset '{repo_id}'."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to load Hugging Face dataset '{repo_id}': {str(e)}"
            )

        # Convert Hugging Face arrow table to Polars DataFrame
        try:
            if hasattr(ds, "data") and hasattr(ds.data, "table"):
                df = pl.from_arrow(ds.data.table)
            else:
                pdf = ds.to_pandas()
                df = pl.from_pandas(pdf)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to convert Hugging Face dataset to tabular format: {str(e)}"
            )

        if df.height == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The Hugging Face dataset '{repo_id}' (split: {resolved_split}) contains 0 rows."
            )
        if df.width == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The Hugging Face dataset '{repo_id}' contains 0 columns."
            )

        # Convert to canonical Parquet bytes
        try:
            raw_parquet_bytes = DataReader.dataframe_to_parquet_bytes(df)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to serialize dataset to Parquet: {str(e)}"
            )

        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(raw_parquet_bytes) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Hugging Face dataset split '{resolved_split}' ({len(raw_parquet_bytes) // (1024 * 1024)}MB) exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB}MB."
            )

        sanitized_slug = repo_id.replace("/", "_").replace(".", "_")
        filename = f"{sanitized_slug}_{resolved_split}.parquet"

        dataset_name = (
            custom_name.strip()
            if custom_name and custom_name.strip()
            else repo_id.split("/")[-1].replace("-", " ").replace("_", " ").title()
        )

        return df, raw_parquet_bytes, filename, "parquet", dataset_name, repo_id, resolved_split
