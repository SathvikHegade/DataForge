"""add dataset source and source_url

Revision ID: 002_add_dataset_source
Revises: 001_initial_dataforge_schema
Create Date: 2026-10-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '002_add_dataset_source'
down_revision = '001_initial_dataforge_schema'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('datasets', sa.Column('source', sa.String(32), nullable=False, server_default='local'))
    op.add_column('datasets', sa.Column('source_url', sa.String(512), nullable=True))

def downgrade() -> None:
    op.drop_column('datasets', 'source_url')
    op.drop_column('datasets', 'source')
