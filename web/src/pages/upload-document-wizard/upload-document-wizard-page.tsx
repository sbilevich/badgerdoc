import Wizard, {
    renderWizardButtons,
    WizardPropsStep
} from '../../shared/components/wizard/wizard/wizard';
import { Text } from '@epam/loveship';

import { DOCUMENTS_PAGE, JOBS_PAGE } from '../../shared/constants';
import UploadWizardPreprocessor, {
    UploadWizardPreprocessorResult
} from '../../components/upload-wizard/preprocessor/upload-wizard-preprocessor';
import React, { useCallback, useState } from 'react';
import { getError } from 'shared/helpers/get-error';
import { UploadFilesControl } from '../../components/upload-files-control/upload-files-control';
import { useUploadFilesMutation } from 'api/hooks/documents';
import { useNotifications } from 'shared/components/notifications';
import AddJobConnector from 'connectors/add-job-connector/add-job-connector';
import {
    DatasetWizardScreen,
    DatasetWizardScreenResult
} from '../../shared/components/wizard/dataset-wizard-screen/dataset-wizard-screen';
import { useAddDatasetMutation, useAddFilesToDatasetMutation } from '../../api/hooks/datasets';
import { DatasetWithFiles } from '../../components';
import { runPreprocessing } from '../../api/hooks/models';

import wizardStyles from 'shared/components/wizard/wizard/wizard.module.scss';
import { useHistory } from 'react-router';

export const UploadWizardPage = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [uploadedFilesIds, setUploadedFilesIds] = useState<number[]>([]);

    const [datasetStepData, setDatasetStepData] = useState<DatasetWizardScreenResult>();

    const [preprocessorStepData, setPreprocessorStepData] =
        useState<UploadWizardPreprocessorResult>();

    const { notifyError, notifySuccess } = useNotifications();
    const uploadFilesMutation = useUploadFilesMutation();
    const addDatasetMutation = useAddDatasetMutation();
    const addFilesToDatasetMutation = useAddFilesToDatasetMutation();

    const history = useHistory();

    const handleJobAdded = (id: number) => {
        if (id) {
            history.push(`${JOBS_PAGE}/${id}`);
        }
    };

    const uploadFilesHandler = useCallback(async () => {
        try {
            // todo: put this inside <UploadFilesControl>
            setIsLoading(true);
            const responses = await uploadFilesMutation.mutateAsync(files);
            const filesIds: Array<number> = [];
            for (const response of responses) {
                filesIds.push(response.id);
                notifySuccess(<Text>{response.message}</Text>);
            }
            setUploadedFilesIds(filesIds);
        } catch (error) {
            notifyError(<Text>{getError(error)}</Text>);
        } finally {
            setIsLoading(false);
        }
    }, [files]);

    const isDatasetStepNextDisabled = () =>
        (datasetStepData?.optionId === 2 && !datasetStepData.selectedDataset) ||
        (datasetStepData?.optionId === 3 && !datasetStepData.datasetName);

    const datasetHandler = async () => {
        switch (datasetStepData?.optionId) {
            // existing dataset
            case 2: {
                const datasetWithFiles: DatasetWithFiles = {
                    name: datasetStepData?.selectedDataset?.name || '',
                    objects: uploadedFilesIds
                };
                await addFilesToDatasetMutation.mutateAsync(datasetWithFiles);
                break;
            }

            // new dataset
            case 3: {
                // can also be saved to newDataset
                await addDatasetMutation.mutateAsync(datasetStepData.datasetName || '');
                break;
            }
        }
    };

    const preprocessorHandler = async () => {
        if (!preprocessorStepData?.preprocessor || !uploadedFilesIds.length) {
            return;
        }
        await Promise.allSettled([
            runPreprocessing(
                uploadedFilesIds,
                preprocessorStepData?.preprocessor,
                preprocessorStepData?.selectedLanguages
            )
        ]);
    };

    const [stepIndex, setStepIndex] = useState(0);
    const handleNext = () => {
        setStepIndex(stepIndex + 1);
    };

    const steps: WizardPropsStep[] = [
        {
            title: 'Upload',
            content: (
                <>
                    <div className={wizardStyles['content__body']}>
                        <UploadFilesControl
                            value={files}
                            onValueChange={setFiles}
                            isLoading={isLoading}
                        />
                    </div>
                    <div className={wizardStyles['content__footer']}>
                        {renderWizardButtons({
                            onNextClick: () => {
                                uploadFilesHandler();
                                handleNext();
                            },
                            disableNextButton: !files.length
                        })}
                    </div>
                </>
            )
        },
        {
            title: 'Dataset',
            content: (
                <>
                    <div className={wizardStyles['content__body']}>
                        <DatasetWizardScreen onChange={setDatasetStepData} />
                    </div>
                    <div className={wizardStyles['content__footer']}>
                        {renderWizardButtons({
                            onNextClick: () => {
                                datasetHandler();
                                handleNext();
                            },
                            disableNextButton: isDatasetStepNextDisabled()
                        })}
                    </div>
                </>
            )
        },
        {
            title: 'Preprocessor',
            content: (
                <>
                    <div className={wizardStyles['content__body']}>
                        <UploadWizardPreprocessor onChange={setPreprocessorStepData} />
                    </div>
                    <div className={wizardStyles['content__footer']}>
                        {renderWizardButtons({
                            onNextClick: () => {
                                preprocessorHandler();
                                handleNext();
                            }
                        })}
                    </div>
                </>
            )
        },
        {
            title: 'Extraction and Annotation',
            content: (
                <AddJobConnector
                    onJobAdded={handleJobAdded}
                    files={uploadedFilesIds}
                    renderWizardButtons={({ save, disableNextButton, finishButtonCaption }) =>
                        renderWizardButtons({
                            onNextClick: save,
                            nextButtonCaption: finishButtonCaption,
                            disableNextButton
                        })
                    }
                    showNoExtractionTab={true}
                />
            )
        }
    ];

    return <Wizard steps={steps} returnUrl={DOCUMENTS_PAGE} stepIndex={stepIndex} />;
};
