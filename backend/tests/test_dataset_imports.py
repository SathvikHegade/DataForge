import io
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.engine.importers import DatasetImporter
from app.models.user import User
from app.models.dataset import Dataset
from app.core.security import create_access_token

client = TestClient(app)


@pytest.fixture
def auth_headers(db_session=None):
    from app.database import SessionLocal
    from app.core.security import get_password_hash
    db = SessionLocal()
    try:
        test_email = "importer_test_user@example.com"
        user = db.query(User).filter(User.email == test_email).first()
        if not user:
            user = User(
                email=test_email,
                hashed_password=get_password_hash("testpassword123"),
                full_name="Import Test User",
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_access_token({"sub": user.id})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def test_kaggle_url_and_identifier_parsing():
    # Valid formats
    assert DatasetImporter.parse_kaggle_identifier("https://www.kaggle.com/datasets/heptapod/titanic") == "heptapod/titanic"
    assert DatasetImporter.parse_kaggle_identifier("https://kaggle.com/datasets/heptapod/titanic") == "heptapod/titanic"
    assert DatasetImporter.parse_kaggle_identifier("https://www.kaggle.com/datasets/user/dataset-name?select=file.csv") == "user/dataset-name"
    assert DatasetImporter.parse_kaggle_identifier("heptapod/titanic") == "heptapod/titanic"
    assert DatasetImporter.parse_kaggle_identifier("user-name/dataset_123.name") == "user-name/dataset_123.name"

    # SSRF & domain checks
    with pytest.raises(Exception) as exc:
        DatasetImporter.parse_kaggle_identifier("https://evil-site.com/datasets/user/data")
    assert "Invalid Kaggle domain" in str(exc.value)

    # Path traversal & invalid identifiers
    with pytest.raises(Exception):
        DatasetImporter.parse_kaggle_identifier("../../../etc/passwd")

    with pytest.raises(Exception):
        DatasetImporter.parse_kaggle_identifier("just-a-name-without-owner")


def test_huggingface_url_and_identifier_parsing():
    # Valid formats
    assert DatasetImporter.parse_huggingface_identifier("https://huggingface.co/datasets/scikit-learn/iris") == "scikit-learn/iris"
    assert DatasetImporter.parse_huggingface_identifier("https://www.huggingface.co/datasets/scikit-learn/iris") == "scikit-learn/iris"
    assert DatasetImporter.parse_huggingface_identifier("https://huggingface.co/datasets/imdb") == "imdb"
    assert DatasetImporter.parse_huggingface_identifier("scikit-learn/iris") == "scikit-learn/iris"
    assert DatasetImporter.parse_huggingface_identifier("imdb") == "imdb"

    # SSRF & domain checks
    with pytest.raises(Exception) as exc:
        DatasetImporter.parse_huggingface_identifier("https://malicious.com/datasets/owner/repo")
    assert "Invalid Hugging Face domain" in str(exc.value)

    # Path traversal & invalid characters
    with pytest.raises(Exception):
        DatasetImporter.parse_huggingface_identifier("../../../bad")


def test_kaggle_import_missing_credentials(auth_headers):
    # Ensure environment variables for kaggle are not set
    with patch.dict(os.environ, {}, clear=True), \
         patch("app.config.settings.KAGGLE_USERNAME", None), \
         patch("app.config.settings.KAGGLE_KEY", None), \
         patch("app.config.settings.KAGGLE_API_TOKEN", None), \
         patch("os.path.exists", return_value=False):
        response = client.post(
            "/api/v1/datasets/kaggle",
            headers=auth_headers,
            json={"url": "https://www.kaggle.com/datasets/heptapod/titanic"}
        )
        assert response.status_code == 400
        assert "credentials are not configured" in response.json()["detail"].lower()


def test_kaggle_import_with_mocked_api(auth_headers, tmp_path):
    mock_csv_content = b"PassengerId,Survived,Pclass,Name,Sex,Age\n1,0,3,Braund,male,22\n2,1,1,Cumings,female,38\n"

    def fake_download_files(dataset, path, unzip, quiet):
        out_file = os.path.join(path, "titanic.csv")
        with open(out_file, "wb") as f:
            f.write(mock_csv_content)

    mock_kaggle_api = MagicMock()
    mock_kaggle_api.dataset_download_files.side_effect = fake_download_files

    with patch.object(DatasetImporter, "get_kaggle_api", return_value=mock_kaggle_api):
        response = client.post(
            "/api/v1/datasets/kaggle",
            headers=auth_headers,
            json={
                "url": "https://www.kaggle.com/datasets/heptapod/titanic",
                "name": "Titanic Passenger List",
                "description": "Mocked test Kaggle import"
            }
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Titanic Passenger List"
        assert data["source"] == "kaggle"
        assert "titanic" in data["source_url"]
        assert data["format"] == "csv"
        assert data["current_version"] is not None
        assert data["current_version"]["row_count"] == 2
        assert data["current_version"]["column_count"] == 6


def test_huggingface_splits_endpoint(auth_headers):
    response = client.post(
        "/api/v1/datasets/huggingface/splits",
        headers=auth_headers,
        json={"url": "https://huggingface.co/datasets/scikit-learn/iris"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["repository"] == "scikit-learn/iris"
    assert "train" in data["splits"]
    assert data["default_split"] == "train"


def test_huggingface_import_dataset(auth_headers):
    response = client.post(
        "/api/v1/datasets/huggingface",
        headers=auth_headers,
        json={
            "url": "https://huggingface.co/datasets/scikit-learn/iris",
            "split": "train",
            "name": "Iris Flower Dataset"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Iris Flower Dataset"
    assert data["source"] == "huggingface"
    assert "scikit-learn/iris" in data["source_url"]
    assert data["format"] == "parquet"
    assert data["current_version"] is not None
    assert data["current_version"]["row_count"] == 150
    assert data["current_version"]["column_count"] == 6


def test_huggingface_nonexistent_dataset(auth_headers):
    response = client.post(
        "/api/v1/datasets/huggingface",
        headers=auth_headers,
        json={"url": "nonexistent-user-dataforge/never-existed-dataset-12345"}
    )
    assert response.status_code == 404
    assert "could not be found" in response.json()["detail"].lower()


def test_dataset_list_includes_source_indicator(auth_headers):
    response = client.get("/api/v1/datasets/", headers=auth_headers)
    assert response.status_code == 200
    datasets = response.json()
    assert len(datasets) > 0
    # Confirm every dataset in list has source field
    for d in datasets:
        assert "source" in d
        assert d["source"] in ("local", "kaggle", "huggingface")
