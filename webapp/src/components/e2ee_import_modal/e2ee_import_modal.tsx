import React from 'react';
import {Modal} from 'react-bootstrap';

import ConfirmModal from 'components/confirm_modal';
import {AppPrivKeyIsDifferent} from 'privkey';

import {E2EEImportModalProps} from './index';

type E2EEImportModalState = {
    privkey: string
    errorMsg: string
    showConfirmModal: boolean
    showSuccess: boolean
}

export class E2EEImportModal extends React.Component<E2EEImportModalProps, E2EEImportModalState> {
    constructor(props: E2EEImportModalProps) {
        super(props);
        this.state = {
            privkey: '',
            errorMsg: '',
            showConfirmModal: false,
            showSuccess: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleConfirmImport = this.handleConfirmImport.bind(this);
        this.doExit = this.doExit.bind(this);
    }

    async onSubmit() {
        const backupGPG = this.state.privkey;

        // @ts-ignore
        const {data, error} = await this.props.actions.appPrivKeyImport(backupGPG, false /* force */);
        if (error) {
            if (error instanceof AppPrivKeyIsDifferent) {
                this.setState({showConfirmModal: true});
                return;
            }
            this.setState({errorMsg: error.message});
            return;
        }
        this.showModalSuccess();
    }

    handleChange(e: any) {
        this.setState({
            privkey: e.target.value,
        });
    }

    handleCancel(e: any) {
        this.setState({showConfirmModal: false});
    }

    showModalSuccess() {
        this.setState({showSuccess: true});
    }

    doExit() {
        this.setState({showSuccess: false});
        this.props.actions.close();
    }

    async handleConfirmImport(e: any) {
        const backupGPG = this.state.privkey;

        // @ts-ignore
        const {data, error} = await this.props.actions.appPrivKeyImport(backupGPG, true /* force */);
        if (error) {
            this.setState({errorMsg: error.message});
            return;
        }
        this.setState({showConfirmModal: false});
        this.showModalSuccess();
    }

    render() {
        if (!this.props.visible) {
            return null;
        }

        const confirmImportMessage = 'WARNING: the private key you want to import does not have the same public key as the one known by this Mattermost server. Importing a different private key would prevent you from reading old encrypted messages, and prevent other users from reading your old messages.\n\nDo you still want to import this key?';

        const modalTitle = 'E2EE private key import';

        return (
            <form>
                <Modal
                    dialogClassName='modal--scroll'
                    show={this.props.visible}
                    onHide={this.props.actions.close}
                    onExited={this.props.actions.close}
                    animation={true}
                    bsSize='large'
                    backdrop='static'
                >
                    <Modal.Header closeButton={true}>
                        <Modal.Title>{modalTitle}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div className='form-group'>
                            <textarea
                                className='form-control'
                                rows={10}
                                cols={20}
                                id='e2ee_import.privkey'
                                placeholder={'Copy/paste your private key here.'}
                                value={this.state.privkey}
                                onChange={this.handleChange}
                            />
                        </div>
                        <p>{this.state.errorMsg}</p>
                    </Modal.Body>
                    <Modal.Footer>
                        <button
                            type='submit'
                            onClick={this.props.actions.close}
                            className='btn btn-link'
                        >{'Cancel'}</button>
                        <button
                            type='submit'
                            onClick={this.onSubmit}
                            tabIndex={2}
                            className='btn btn-primary'
                        >{'Import'}</button>
                    </Modal.Footer>
                </Modal>
                <ConfirmModal
                    cancelButtonText={'Cancel'}
                    confirmButtonText={'Force import'}
                    confirmButtonClass={'btn btn-danger'}
                    hideCancel={false}
                    message={confirmImportMessage}
                    onCancel={this.handleCancel}
                    onConfirm={this.handleConfirmImport}
                    show={this.state.showConfirmModal}
                    title={'Confirm import'}
                />
                <ConfirmModal
                    confirmButtonText={'Okay'}
                    confirmButtonClass={'btn btn-primary'}
                    cancelButtonText={'Cancel'}
                    onCancel={this.doExit}
                    hideCancel={true}
                    message={'Key has been imported with success!'}
                    onConfirm={this.doExit}
                    show={this.state.showSuccess}
                    title={modalTitle}
                />
            </form>

        );
    }
}
