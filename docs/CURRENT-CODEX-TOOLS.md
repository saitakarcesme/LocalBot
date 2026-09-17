# Codex araç kataloğu — 17 Eylül 2026

Bu oturumun functions.exec aracına sunduğu katalog: **269 araç**. Ayrıca aşağıda ayrı listelenen **13 kontrol/yönlendirme aracı** var; hepsi birlikte **282 giriş**. Bunlar kayıtlı girişlerdir; her servisin kimliği doğrulanmış veya her çağrının her durumda izinli olduğu anlamına gelmez. Bu sayı tüm Codex kurulumları için sabit değildir. Skills ve bir aracın alt komutları ayrı sayılmadı.

LocalBot: **33 kayıtlı built-in**, mevcut bot izinlerinin birleşiminde **28 erişilebilir**; 5 MCP aracı kurulu bağlantı olmadığı için botlara sunulmuyor. Ham kayıt farkı 269−33 = **236**; bu yetenek eksikliği sayısı değildir.

## Çekirdek (11)

- `apply_patch`
- `create_goal`
- `exec_command`
- `get_goal`
- `list_mcp_resource_templates`
- `list_mcp_resources`
- `read_mcp_resource`
- `request_plugin_install`
- `update_goal`
- `view_image`
- `write_stdin`

## Saat (1)

- `clock__curr_time`

## Görsel üretimi (1)

- `image_gen__imagegen`

## Codex uygulaması (31)

- `mcp__codex_app__automation_update`
- `mcp__codex_app__capture_screen_context`
- `mcp__codex_app__consume_usage_reset`
- `mcp__codex_app__create_sidebar_section`
- `mcp__codex_app__create_thread`
- `mcp__codex_app__delete_sidebar_section`
- `mcp__codex_app__end_realtime_voice_call`
- `mcp__codex_app__fork_thread`
- `mcp__codex_app__get_handoff_status`
- `mcp__codex_app__get_usage_limits`
- `mcp__codex_app__handoff_thread`
- `mcp__codex_app__list_archived_threads`
- `mcp__codex_app__list_projects`
- `mcp__codex_app__list_threads`
- `mcp__codex_app__load_workspace_dependencies`
- `mcp__codex_app__move_project_to_sidebar_section`
- `mcp__codex_app__move_thread_to_sidebar_section`
- `mcp__codex_app__navigate_to_codex_page`
- `mcp__codex_app__open_in_codex`
- `mcp__codex_app__read_thread`
- `mcp__codex_app__read_thread_terminal`
- `mcp__codex_app__rename_sidebar_section`
- `mcp__codex_app__reorder_section`
- `mcp__codex_app__reorder_sidebar_projects`
- `mcp__codex_app__reorder_sidebar_sections`
- `mcp__codex_app__send_message_to_thread`
- `mcp__codex_app__set_thread_archived`
- `mcp__codex_app__set_thread_title`
- `mcp__codex_app__share_thread`
- `mcp__codex_app__uninstall_plugin`
- `mcp__codex_app__wait_threads`

## Belge kontrolü (3)

- `mcp__codex_apps__codex_document_control_execute_document_command`
- `mcp__codex_apps__codex_document_control_get_document_tool_schemas`
- `mcp__codex_apps__codex_document_control_list_document_sessions`

## Figma (38)

- `mcp__codex_apps__figma_add_code_connect_map`
- `mcp__codex_apps__figma_create_generative_plugin`
- `mcp__codex_apps__figma_create_new_file`
- `mcp__codex_apps__figma_create_shader`
- `mcp__codex_apps__figma_download_assets`
- `mcp__codex_apps__figma_export_video`
- `mcp__codex_apps__figma_generate_deck`
- `mcp__codex_apps__figma_generate_diagram`
- `mcp__codex_apps__figma_generate_figma_design`
- `mcp__codex_apps__figma_get_code_connect_map`
- `mcp__codex_apps__figma_get_code_connect_suggestions`
- `mcp__codex_apps__figma_get_context_for_code_connect`
- `mcp__codex_apps__figma_get_design_context`
- `mcp__codex_apps__figma_get_figjam`
- `mcp__codex_apps__figma_get_generative_plugin`
- `mcp__codex_apps__figma_get_libraries`
- `mcp__codex_apps__figma_get_metadata`
- `mcp__codex_apps__figma_get_motion_context`
- `mcp__codex_apps__figma_get_screenshot`
- `mcp__codex_apps__figma_get_shader`
- `mcp__codex_apps__figma_get_variable_defs`
- `mcp__codex_apps__figma_list_file_components_for_code_connect`
- `mcp__codex_apps__figma_list_file_shaders`
- `mcp__codex_apps__figma_list_generative_plugins`
- `mcp__codex_apps__figma_list_shaders`
- `mcp__codex_apps__figma_search_design_system`
- `mcp__codex_apps__figma_send_code_connect_mappings`
- `mcp__codex_apps__figma_update_generative_plugin`
- `mcp__codex_apps__figma_update_shader`
- `mcp__codex_apps__figma_upload_assets`
- `mcp__codex_apps__figma_use_figma`
- `mcp__codex_apps__figma_weave_cancel_tool_run`
- `mcp__codex_apps__figma_weave_get_tool_inputs`
- `mcp__codex_apps__figma_weave_get_tool_run_output`
- `mcp__codex_apps__figma_weave_list_tools`
- `mcp__codex_apps__figma_weave_run_tool`
- `mcp__codex_apps__figma_weave_upload_asset`
- `mcp__codex_apps__figma_whoami`

## GitHub (89)

- `mcp__codex_apps__github_add_comment_to_issue`
- `mcp__codex_apps__github_add_issue_assignees`
- `mcp__codex_apps__github_add_issue_labels`
- `mcp__codex_apps__github_add_reaction_to_issue_comment`
- `mcp__codex_apps__github_add_reaction_to_pr`
- `mcp__codex_apps__github_add_reaction_to_pr_review_comment`
- `mcp__codex_apps__github_add_review_to_pr`
- `mcp__codex_apps__github_compare_commits`
- `mcp__codex_apps__github_convert_pull_request_to_draft`
- `mcp__codex_apps__github_create_blob`
- `mcp__codex_apps__github_create_branch`
- `mcp__codex_apps__github_create_commit`
- `mcp__codex_apps__github_create_file`
- `mcp__codex_apps__github_create_issue`
- `mcp__codex_apps__github_create_pull_request`
- `mcp__codex_apps__github_create_tree`
- `mcp__codex_apps__github_delete_file`
- `mcp__codex_apps__github_dismiss_pull_request_review`
- `mcp__codex_apps__github_download_user_content`
- `mcp__codex_apps__github_download_workflow_artifact`
- `mcp__codex_apps__github_enable_auto_merge`
- `mcp__codex_apps__github_fetch`
- `mcp__codex_apps__github_fetch_blob`
- `mcp__codex_apps__github_fetch_commit`
- `mcp__codex_apps__github_fetch_commit_workflow_runs`
- `mcp__codex_apps__github_fetch_file`
- `mcp__codex_apps__github_fetch_issue`
- `mcp__codex_apps__github_fetch_issue_comments`
- `mcp__codex_apps__github_fetch_pr`
- `mcp__codex_apps__github_fetch_pr_comments`
- `mcp__codex_apps__github_fetch_pr_file_patch`
- `mcp__codex_apps__github_fetch_pr_patch`
- `mcp__codex_apps__github_fetch_workflow_job_logs`
- `mcp__codex_apps__github_fetch_workflow_job_steps`
- `mcp__codex_apps__github_fetch_workflow_run_artifacts`
- `mcp__codex_apps__github_fetch_workflow_run_jobs`
- `mcp__codex_apps__github_get_commit_combined_status`
- `mcp__codex_apps__github_get_issue_comment_reactions`
- `mcp__codex_apps__github_get_pr_diff`
- `mcp__codex_apps__github_get_pr_info`
- `mcp__codex_apps__github_get_pr_reactions`
- `mcp__codex_apps__github_get_pr_review_comment_reactions`
- `mcp__codex_apps__github_get_profile`
- `mcp__codex_apps__github_get_repo`
- `mcp__codex_apps__github_get_repo_collaborator_permission`
- `mcp__codex_apps__github_get_user_login`
- `mcp__codex_apps__github_get_users_recent_prs_in_repo`
- `mcp__codex_apps__github_label_pr`
- `mcp__codex_apps__github_list_installations`
- `mcp__codex_apps__github_list_installed_accounts`
- `mcp__codex_apps__github_list_pr_changed_filenames`
- `mcp__codex_apps__github_list_pull_request_review_threads`
- `mcp__codex_apps__github_list_pull_request_reviews`
- `mcp__codex_apps__github_list_recent_issues`
- `mcp__codex_apps__github_list_repositories`
- `mcp__codex_apps__github_list_repositories_by_affiliation`
- `mcp__codex_apps__github_list_repositories_by_installation`
- `mcp__codex_apps__github_list_user_org_memberships`
- `mcp__codex_apps__github_list_user_orgs`
- `mcp__codex_apps__github_lock_issue_conversation`
- `mcp__codex_apps__github_mark_pull_request_ready_for_review`
- `mcp__codex_apps__github_merge_pull_request`
- `mcp__codex_apps__github_remove_issue_assignees`
- `mcp__codex_apps__github_remove_issue_label`
- `mcp__codex_apps__github_remove_pull_request_reviewers`
- `mcp__codex_apps__github_remove_reaction_from_issue_comment`
- `mcp__codex_apps__github_remove_reaction_from_pr`
- `mcp__codex_apps__github_remove_reaction_from_pr_review_comment`
- `mcp__codex_apps__github_reply_to_review_comment`
- `mcp__codex_apps__github_request_pull_request_reviewers`
- `mcp__codex_apps__github_rerun_failed_workflow_run_jobs`
- `mcp__codex_apps__github_rerun_workflow_job`
- `mcp__codex_apps__github_resolve_review_thread`
- `mcp__codex_apps__github_search`
- `mcp__codex_apps__github_search_branches`
- `mcp__codex_apps__github_search_commits`
- `mcp__codex_apps__github_search_installed_repositories_streaming`
- `mcp__codex_apps__github_search_installed_repositories_v2`
- `mcp__codex_apps__github_search_issues`
- `mcp__codex_apps__github_search_prs`
- `mcp__codex_apps__github_search_repositories`
- `mcp__codex_apps__github_unlock_issue_conversation`
- `mcp__codex_apps__github_unresolve_review_thread`
- `mcp__codex_apps__github_update_file`
- `mcp__codex_apps__github_update_issue`
- `mcp__codex_apps__github_update_issue_comment`
- `mcp__codex_apps__github_update_pull_request`
- `mcp__codex_apps__github_update_ref`
- `mcp__codex_apps__github_update_review_comment`

## Gmail (21)

- `mcp__codex_apps__gmail_apply_labels_to_emails`
- `mcp__codex_apps__gmail_archive_emails`
- `mcp__codex_apps__gmail_batch_modify_email`
- `mcp__codex_apps__gmail_batch_read_email`
- `mcp__codex_apps__gmail_batch_read_email_threads`
- `mcp__codex_apps__gmail_bulk_label_matching_emails`
- `mcp__codex_apps__gmail_create_draft`
- `mcp__codex_apps__gmail_create_label`
- `mcp__codex_apps__gmail_delete_emails`
- `mcp__codex_apps__gmail_forward_emails`
- `mcp__codex_apps__gmail_get_profile`
- `mcp__codex_apps__gmail_list_drafts`
- `mcp__codex_apps__gmail_list_labels`
- `mcp__codex_apps__gmail_read_attachment`
- `mcp__codex_apps__gmail_read_email`
- `mcp__codex_apps__gmail_read_email_thread`
- `mcp__codex_apps__gmail_search_email_ids`
- `mcp__codex_apps__gmail_search_emails`
- `mcp__codex_apps__gmail_send_draft`
- `mcp__codex_apps__gmail_send_email`
- `mcp__codex_apps__gmail_update_draft`

## Destek hattı (1)

- `mcp__codex_apps__hotline_get_local_hotline`

## Hugging Face (9)

- `mcp__codex_apps__hugging_face_dataset_search`
- `mcp__codex_apps__hugging_face_hf_doc_fetch`
- `mcp__codex_apps__hugging_face_hf_doc_search`
- `mcp__codex_apps__hugging_face_hf_jobs`
- `mcp__codex_apps__hugging_face_hf_whoami`
- `mcp__codex_apps__hugging_face_hub_repo_details`
- `mcp__codex_apps__hugging_face_model_search`
- `mcp__codex_apps__hugging_face_paper_search`
- `mcp__codex_apps__hugging_face_space_search`

## Plugin yönetimi (6)

- `mcp__codex_apps__plugin_management_get_app_permissions`
- `mcp__codex_apps__plugin_management_get_plugin_dependencies`
- `mcp__codex_apps__plugin_management_search_plugins`
- `mcp__codex_apps__plugin_management_suggest_plugins`
- `mcp__codex_apps__plugin_management_uninstall_app`
- `mcp__codex_apps__plugin_management_update_app_permissions`

## Güvenlik ayarları (5)

- `mcp__codex_apps__safety_settings_get_family_info`
- `mcp__codex_apps__safety_settings_get_parental_controls`
- `mcp__codex_apps__safety_settings_get_trusted_contact`
- `mcp__codex_apps__safety_settings_prepare_parental_control_update`
- `mcp__codex_apps__safety_settings_update_parental_control`

## Sites (23)

- `mcp__codex_apps__sites_add_custom_domain`
- `mcp__codex_apps__sites_change_site_slug`
- `mcp__codex_apps__sites_create_site`
- `mcp__codex_apps__sites_create_source_repository_write_credential`
- `mcp__codex_apps__sites_deploy_private_site_version`
- `mcp__codex_apps__sites_deploy_site_version`
- `mcp__codex_apps__sites_generate_siwc_bypass_token`
- `mcp__codex_apps__sites_get_deployment_status`
- `mcp__codex_apps__sites_get_environment_variables`
- `mcp__codex_apps__sites_get_site`
- `mcp__codex_apps__sites_get_site_version`
- `mcp__codex_apps__sites_get_site_worker_logs`
- `mcp__codex_apps__sites_list_custom_domains`
- `mcp__codex_apps__sites_list_site_versions`
- `mcp__codex_apps__sites_list_sites`
- `mcp__codex_apps__sites_read_database_overview`
- `mcp__codex_apps__sites_read_database_table_rows`
- `mcp__codex_apps__sites_refresh_custom_domain_status`
- `mcp__codex_apps__sites_remove_custom_domain`
- `mcp__codex_apps__sites_save_site_version`
- `mcp__codex_apps__sites_update_environment_variables`
- `mcp__codex_apps__sites_update_site_access`
- `mcp__codex_apps__sites_update_site_metadata`

## Vercel (24)

- `mcp__codex_apps__vercel_add_toolbar_reaction`
- `mcp__codex_apps__vercel_change_toolbar_thread_resolve_status`
- `mcp__codex_apps__vercel_check_domain_availability_and_price`
- `mcp__codex_apps__vercel_deploy_to_vercel`
- `mcp__codex_apps__vercel_edit_toolbar_message`
- `mcp__codex_apps__vercel_get_access_to_vercel_url`
- `mcp__codex_apps__vercel_get_agent_run`
- `mcp__codex_apps__vercel_get_agent_run_trace`
- `mcp__codex_apps__vercel_get_deployment`
- `mcp__codex_apps__vercel_get_deployment_build_logs`
- `mcp__codex_apps__vercel_get_project`
- `mcp__codex_apps__vercel_get_runtime_errors`
- `mcp__codex_apps__vercel_get_runtime_logs`
- `mcp__codex_apps__vercel_get_toolbar_thread`
- `mcp__codex_apps__vercel_import_claude_design_from_url`
- `mcp__codex_apps__vercel_list_agent_run_projects`
- `mcp__codex_apps__vercel_list_agent_runs`
- `mcp__codex_apps__vercel_list_deployments`
- `mcp__codex_apps__vercel_list_projects`
- `mcp__codex_apps__vercel_list_teams`
- `mcp__codex_apps__vercel_list_toolbar_threads`
- `mcp__codex_apps__vercel_reply_to_toolbar_thread`
- `mcp__codex_apps__vercel_search_vercel_documentation`
- `mcp__codex_apps__vercel_web_fetch_vercel_url`

## Node REPL (3)

- `mcp__node_repl__js`
- `mcp__node_repl__js_add_node_module_dir`
- `mcp__node_repl__js_reset`

## Artifact şablonları (2)

- `mcp__openai_artifact_template_picker__choose_artifact_template`
- `mcp__openai_artifact_template_picker__list_artifact_templates`

## Web (1)

- `web__run`

## Ayrı kontrol/yönlendirme araçları (13)

- `functions.exec`
- `functions.wait`
- `functions.request_user_input`
- `functions.request_user_input_async`
- `clock.sleep`
- `collaboration.followup_task`
- `collaboration.interrupt_agent`
- `collaboration.list_agents`
- `collaboration.send_message`
- `collaboration.spawn_agent`
- `collaboration.wait_agent`
- `mcp__cua_repl.js`
- `mcp__cua_repl.js_reset`

`request_user_input` Plan modu ile sınırlıdır; voice, goal, agent ve dış servis araçlarının da kendi kullanım koşulları vardır.

